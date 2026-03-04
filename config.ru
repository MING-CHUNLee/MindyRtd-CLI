require 'rack/cors'
require_relative 'config/environment'
require_relative 'app/application/controllers/app'

# CORS — allow the CLI (any localhost origin) to call the API
use Rack::Cors do
  allow do
    origins 'localhost', '127.0.0.1', /\Ahttp:\/\/localhost(:\d+)?\z/
    resource '*',
             headers: :any,
             methods: %i[get post options]
  end
end

run App
