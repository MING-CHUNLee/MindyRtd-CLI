require 'dotenv'

# Load environment variables.
# Priority: project-root .env → cli/.env (fallback for dev convenience)
project_root = File.expand_path('..', __dir__)

Dotenv.load(
  File.join(project_root, '.env'),         # root-level .env (created by user)
  File.join(project_root, 'cli', '.env')   # CLI dev .env (fallback)
)

# ----------------------------------------------------------------
# Load infrastructure layer first (no dependencies on other layers)
# ----------------------------------------------------------------
require File.join(project_root, 'app', 'infrastructure', 'gateways', 'gemini_api')

# ----------------------------------------------------------------
# Load application services (depend on infrastructure)
# ----------------------------------------------------------------
require File.join(project_root, 'app', 'application', 'services', 'resolve_service')
require File.join(project_root, 'app', 'application', 'services', 'edit_service')
