require 'dotenv/tasks'

# ============================================================
# API Server
# ============================================================

desc 'Start API server on port 9090 (production mode)'
task run: :dotenv do
  sh 'bundle exec puma config.ru -p 9090 -e production'
end

namespace :run do
  desc 'Start API server in development mode (auto-reloads on change)'
  task dev: :dotenv do
    ENV['RACK_ENV'] = 'development'
    sh 'bundle exec puma config.ru -p 9090 -e development'
  end
end

# ============================================================
# Setup
# ============================================================

desc 'Install Ruby dependencies'
task :setup do
  sh 'bundle install'
end

desc 'Check that required environment variables are set'
task :check_env do
  required = %w[GEMINI_API_KEY]
  missing = required.reject { |k| ENV[k] }
  if missing.any?
    puts "❌ Missing required environment variables: #{missing.join(', ')}"
    puts "   Copy cli/.env values or set them in a root .env file."
    exit 1
  else
    puts "✅ All required environment variables are set."
  end
end
