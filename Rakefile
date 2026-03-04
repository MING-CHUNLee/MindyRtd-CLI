require 'dotenv/tasks'

# ============================================================
# API Server
# ============================================================

desc 'Start API server on port 9090 (production mode)'
task run: %i[dotenv db:migrate] do
  sh 'bundle exec puma config.ru -p 9090 -e production'
end

namespace :run do
  desc 'Start API server in development mode'
  task dev: %i[dotenv db:migrate] do
    ENV['RACK_ENV'] = 'development'
    sh 'bundle exec puma config.ru -p 9090 -e development'
  end
end

# ============================================================
# Database
# ============================================================

namespace :db do
  desc 'Run pending migrations'
  task migrate: :dotenv do
    require 'sequel'
    require 'fileutils'

    db_url = ENV.fetch('DATABASE_URL') do
      FileUtils.mkdir_p('db/local')
      'sqlite://db/local/dev.db'
    end

    db = Sequel.connect(db_url)
    Sequel.extension :migration
    Sequel::Migrator.run(db, 'db/migrations')
    puts "✅ Database migrated (#{db_url})"
    db.disconnect
  end

  desc 'Drop and re-run all migrations (destructive!)'
  task reset: :dotenv do
    require 'sequel'

    db_url = ENV.fetch('DATABASE_URL', 'sqlite://db/local/dev.db')
    db_file = db_url.sub('sqlite://', '')

    File.delete(db_file) if File.exist?(db_file)
    puts "🗑  Deleted #{db_file}"

    Rake::Task['db:migrate'].invoke
  end

  desc 'Show recent prompt logs'
  task logs: :dotenv do
    require_relative 'config/environment'

    logs = PromptLog.order(Sequel.desc(:created_at)).limit(20)
    if logs.empty?
      puts 'No logs yet.'
    else
      logs.each do |l|
        puts "[#{l.created_at}] #{l.endpoint.upcase} | #{l.instruction[0..60]} | #{l.duration_ms}ms"
      end
    end
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
