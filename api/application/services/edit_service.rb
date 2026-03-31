# Application Layer — Use Case Service
#
# EditService answers: "Given this file and instruction, what should the new content be?"
#
# It sends the full file content + instruction to Gemini and returns
# the complete modified file as a plain string.
# This mirrors Phase 2 in agent.ts → LLMController.editFiles()

class EditService
  SYSTEM_PROMPT = <<~PROMPT.freeze
    You are an expert R programmer and code editor.

    You will receive an R file's content and an instruction describing what to change.
    Your task is to apply the requested changes and return the complete modified file.

    Rules:
    - Return ONLY the complete modified file content.
    - Do NOT wrap the code in markdown code fences (no ``` blocks).
    - Do NOT add any explanation, commentary, or preamble before or after the code.
    - Preserve the file's overall structure, style, and comments unless the instruction
      specifically asks to change them.
    - Apply the requested changes precisely and minimally.
  PROMPT

  def initialize(gemini: GeminiApi.new)
    @gemini = gemini
  end

  # @param file_path   [String]  Relative file path (used as context for the LLM)
  # @param content     [String]  Original file content
  # @param instruction [String]  Natural language instruction
  # @return            [String]  Complete modified file content
  def call(file_path:, content:, instruction:)
    user_prompt = <<~PROMPT
      File: #{file_path}

      Instruction: #{instruction}

      Current content:
      #{content}

      Return the complete modified file:
    PROMPT

    raw = @gemini.generate(system_prompt: SYSTEM_PROMPT, user_prompt: user_prompt)
    strip_code_fences(raw)
  end

  private

  # Remove markdown code fences in case the LLM wraps its output despite instructions
  def strip_code_fences(text)
    text
      .sub(/\A```(?:r|R)?\r?\n/, '')   # opening fence with optional language tag
      .sub(/\r?\n```\z/, '')            # closing fence
      .strip
  end
end
