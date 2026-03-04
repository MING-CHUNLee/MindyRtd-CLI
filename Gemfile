source 'https://rubygems.org'

ruby '>= 3.2'

# Web server
gem 'puma', '~> 6.0'

# Web framework (lightweight, API-first)
gem 'roda', '~> 3.0'

# CORS support for CLI → API calls
gem 'rack-cors', '~> 2.0'

# HTTP client for Gemini API
gem 'faraday', '~> 2.7'
gem 'faraday-retry', '~> 2.2'

# Database ORM + SQLite (analytics / prompt logging)
gem 'sequel',  '~> 5.0'
gem 'sqlite3', '~> 2.0'

# JSON serialization
gem 'multi_json', '~> 1.15'

# Environment / secrets
gem 'dotenv', '~> 2.8'

group :development, :test do
  gem 'pry', '~> 0.14'
  gem 'rubocop', '~> 1.50', require: false
  gem 'minitest', '~> 5.0'
end
