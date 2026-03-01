# Infrastructure Layer — External Gateway
#
# Wraps the Google Gemini REST API.
# Mirrors the sendToGoogle() logic in cli/src/infrastructure/api/llm-controller.ts
# so both layers speak to Gemini in exactly the same way.
#
# Gemini endpoint:
#   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=KEY
#
# Request body:
#   { contents: [{role, parts:[{text}]}], systemInstruction: {parts:[{text}]}, generationConfig: {...} }
#
# Response:
#   { candidates: [{ content: { parts: [{ text }] } }] }

require 'faraday'
require 'json'

class GeminiApi
  BASE_URL      = 'https://generativelanguage.googleapis.com/v1beta/models'.freeze
  DEFAULT_MODEL = 'gemini-2.5-flash'.freeze

  def initialize
    @api_key    = ENV.fetch('GEMINI_API_KEY') do
      raise 'GEMINI_API_KEY is not set. Add it to your .env or cli/.env file.'
    end
    @model      = ENV.fetch('LLM_MODEL', DEFAULT_MODEL)
    @timeout    = ENV.fetch('LLM_TIMEOUT', '90').to_i
    @max_tokens = ENV.fetch('LLM_MAX_TOKENS', '8192').to_i
  end

  # Generate a response from Gemini.
  #
  # @param system_prompt [String]  Instruction context (maps to systemInstruction)
  # @param user_prompt   [String]  The actual user message
  # @return              [String]  Raw text from the model
  def generate(system_prompt:, user_prompt:)
    url  = "#{BASE_URL}/#{@model}:generateContent?key=#{@api_key}"
    body = build_body(system_prompt, user_prompt)

    response = connection.post(url, body.to_json, 'Content-Type' => 'application/json')

    unless response.success?
      raise "Gemini API error #{response.status}: #{response.body}"
    end

    parsed = JSON.parse(response.body)
    parsed.dig('candidates', 0, 'content', 'parts', 0, 'text') || ''
  end

  private

  def build_body(system_prompt, user_prompt)
    body = {
      contents: [
        { role: 'user', parts: [{ text: user_prompt }] }
      ],
      generationConfig: { maxOutputTokens: @max_tokens }
    }

    unless system_prompt.to_s.strip.empty?
      body[:systemInstruction] = { parts: [{ text: system_prompt }] }
    end

    body
  end

  def connection
    @connection ||= Faraday.new do |f|
      f.options.timeout      = @timeout
      f.options.open_timeout = 10
      f.request :retry, max: 2, interval: 1, exceptions: [Faraday::TimeoutError]
    end
  end
end
