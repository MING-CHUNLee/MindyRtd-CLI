require 'sequel'
require 'fileutils'

module Database
  # app/infrastructure/database/ → app/infrastructure/ → app/ → project root (3 levels)
  PROJECT_ROOT = File.expand_path('../../..', __dir__)

  # Strip sqlite:// prefix if someone sets DATABASE_URL as a URI;
  # Sequel.sqlite() takes a plain file path — this avoids URI space issues on Windows.
  DB_FILE = ENV.fetch('DATABASE_URL') do
    File.join(PROJECT_ROOT, 'db', 'local', 'dev.db')
  end.sub(/\Asqlite:\/\//, '')

  def self.connect
    @db ||= begin
      FileUtils.mkdir_p(File.dirname(DB_FILE))
      # Sequel.sqlite(path) bypasses URI parsing — safe for paths with spaces
      Sequel.sqlite(DB_FILE).tap do |_db|
        puts "[DB] Connected → #{DB_FILE}"
      end
    end
  end

  def self.db
    @db || connect
  end
end

# Global constant used by Sequel models
DB = Database.connect
