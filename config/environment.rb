require 'dotenv'

# Load environment variables.
# Priority: project-root .env → cli/.env (fallback for dev convenience)
project_root = File.expand_path('..', __dir__)

Dotenv.load(
  File.join(project_root, '.env'),         # root-level .env (created by user)
  File.join(project_root, 'cli', '.env')   # CLI dev .env (fallback)
)

# ----------------------------------------------------------------
# Infrastructure: Database (must load before domain models)
# ----------------------------------------------------------------
require File.join(project_root, 'app', 'infrastructure', 'database', 'db')

# Auto-run pending migrations on startup (safe — skips already-applied ones)
Sequel.extension :migration
Sequel::Migrator.run(DB, File.join(project_root, 'db', 'migrations'))

# ----------------------------------------------------------------
# Infrastructure: External API gateways
# ----------------------------------------------------------------
require File.join(project_root, 'app', 'infrastructure', 'gateways', 'gemini_api')

# ----------------------------------------------------------------
# Domain: Models (depend on DB connection)
# ----------------------------------------------------------------
require File.join(project_root, 'app', 'domain', 'models', 'prompt_log')

# ----------------------------------------------------------------
# Application: Services (depend on infrastructure + domain)
# ----------------------------------------------------------------
require File.join(project_root, 'app', 'application', 'services', 'resolve_service')
require File.join(project_root, 'app', 'application', 'services', 'edit_service')
