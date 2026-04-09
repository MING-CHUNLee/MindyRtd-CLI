---
name: presentation-layer
description: Rigorous reference for the Presentation Layer in Service Oriented Architecture (SOA). Use this skill whenever the user asks about presentation layer design, view objects, session state, cookies, flash messages, view refactoring, interface storyboarding, acceptance/BDD testing, representers, ROAR gem, response objects, JSON serialization, HATEOAS, resource representation, or API presentation layer in a layered web architecture. Trigger on questions like "how do I structure my views", "what belongs in the presentation layer", "how do sessions work", "how do I pass error messages between requests", "how do I write BDD tests for my interface", "how do I serialize domain objects to JSON", "what is a representer", "how does the presentation layer change for an API", or "what is HATEOAS".
---

# Presentation Layer

> Source: SOA Week 10 — "Presentation Layer" lecture (Service Oriented Architecture course)

The Presentation Layer is the topmost layer in a layered SOA architecture. Its sole responsibility is to **show application results** and **capture the view** — it renders output to the user and receives input from the user.

> **Strict Rule: The Presentation Layer is output-only. It never performs logic.**
>
> No business rules, no domain decisions, no data transformations, no conditional branching on domain state. If a piece of code is deciding *what* to do rather than *how to display* it, it does not belong here. Logic lives in the Domain Model or Application Layer. The presentation layer only asks: "Given this prepared data, how do I display it?"

---

## Layered Architecture Context

The full stack (bottom to top):

| Layer | Responsibility | Components |
|---|---|---|
| **Infrastructure** | Outside resources: retrieve/store data | Repositories, DataMappers, ORM, Gateways |
| **Domain Model** | Decision-making — "Heart of the Software" | Entities + Values |
| **Application** | Orchestrate steps to accomplish requests | Controllers |
| **Presentation** | Show results, capture the view | View Objects, View Templates, Assets |

**Key invariant:** The Domain Model does not change when other layers change. Changes in the domain *may* cascade upward into other layers, but never downward.

---

## Presentation Layer: Rigorous Definition

The Presentation Layer consists of exactly three sub-components:

### 1. Assets (CSS + JS)
Static files that control visual styling and client-side behavior. They are independent of domain logic and can be changed without touching any Ruby code.

```
app/presentation/assets/
├── css/
│   └── style.css
└── js/
    └── table_row.js
```

### 2. View Objects (Presentation Objects)
Ruby classes in `app/presentation/view_objects/` that act as an **adapter boundary** between the Domain Model and the View Templates. They exist because raw domain objects expose too much internal structure to templates.

**What view objects are NOT:**
View objects are not a place for logic. They do not make domain decisions, validate data, or branch based on business rules. Their only job is to translate prepared domain data into display-ready strings, links, and identifiers — pure formatting for output.

**Why view objects are necessary:**
Without them, view templates must:
- Perform complex loops with indexes
- Know the nested domain structure
- Know routing paths of controllers
- Construct entity-specific strings
- Build complex, mapped output

This means only a domain expert can write or maintain views, and any domain change requires changing every affected view.

**What view objects provide:**
- Absorb domain changes — templates reference stable view object methods
- Simple, clean interface for template authors (no domain knowledge required)
- Only layout code remains in the template

**Example view object (`project.rb`):**
```ruby
module Views
  # View for a single project entity
  class Project
    def initialize(project, index = nil)
      @project = project
      @index = index
    end

    def praise_link
      "/project/#{fullname}"
    end

    def index_str
      "project[#{@index}]"
    end

    def contributor_names
      @project.contributors.map(&:username).join(', ')
    end

    def owner_name
      @project.owner.username
    end

    def fullname
      "#{owner_name}/#{name}"
    end
  end
end
```

**Example list view object (`projects_list.rb`):**
```ruby
module Views
  class ProjectsList
    def initialize(projects)
      @projects = projects.map.with_index { |proj, i| Project.new(proj, i) }
    end

    def each
      @projects.each { |proj| yield proj }
    end

    def any?
      @projects.any?
    end
  end
end
```

Controller creates and passes the view object — never the raw domain entity:
```ruby
viewable_projects = Views::ProjectsList.new(projects)
view 'home', locals: { projects: viewable_projects }
```

### 3. View Templates (Slim / HTML)
Files in `app/presentation/views_html/` that render HTML. After refactoring with view objects, templates contain **only layout code** — no domain logic, no string construction, no index arithmetic.

**Before refactoring (problematic):**
```slim
- projects.each.with_index do |project, index|
  tr data-href="project/#{project.owner.username}/#{project.name}"
    td
      = project.contributors.map(&:username).join(', ')
```

**After refactoring (clean):**
```slim
- projects.each do |project|
  tr class="table-row project-row" data-href=project.praise_link id="#{project.index_str}.row"
    td id='td_owner'
      span class="project_table_owner" id="#{project.index_str}.owner"
        = project.owner_name
    td id='td_members'
      span class="project_table_member" id="#{project.index_str}.contributors"
        = project.contributor_names
```

**Full folder layout:**
```
app/presentation/
├── assets/
│   ├── css/style.css
│   └── js/table_row.js
├── view_objects/
│   ├── init.rb
│   ├── contributor.rb
│   ├── project.rb
│   ├── projects_list.rb
│   ├── project_file_contributions.rb
│   └── project_folder_contributions.rb
└── views_html/
    ├── flash_bar.slim
    ├── home.slim
    ├── layout.slim
    └── project.slim
```

---

## Session State

### Definition
**User's Session State** = information about the *current visit* by a user:
- The **identity** of the current visitor → which view the user should see
- The **result** of the last transaction → what messages to show the user

Every visit involves multiple interactions across multiple views, all of which need consistent identity and context.

### The Stateless HTTP Problem
HTTP is a **stateless protocol** — the web application starts fresh on every request and cannot know:
- The identity of the current visitor
- What the visitor has done in the past
- The result of the last transaction

Single-device applications can keep state in local memory. Web applications cannot — they receive requests from many users simultaneously, with no persistent connection.

### Cookies: Client-Side Session State Solution

Cookies are the standard mechanism for carrying session state across stateless HTTP.

| Property | Description |
|---|---|
| **Name** | Key used to retrieve the cookie |
| **Text Value** | Serialized data (encrypting is best practice) |
| **Domain** | Domain the cookie belongs to |
| **Path** | Path of the resource that created the cookie |
| **Expiration** | When the cookie expires (date-time, or "Session") |

**Session ID**: a special cookie value used by the server application to uniquely identify the user's session.

**Cookie lifecycle in HTTP:**
1. Browser sends `GET /` → server prepares Session ID and cookie data, sends `200 OK` with cookie
2. Browser stores cookie locally; sends it back on every subsequent HTTP request
3. Server reads cookie, retrieves session data, updates cookie on every HTTP response

### Roda: Sessions the Hard Way (raw cookies)
```ruby
routing.root do
  watching_cookie = routing.cookies['watching']
  watching = if watching_cookie.nil?
    []
  else
    JSON.parse(watching_cookie)
  end
end

# Adding to session:
watching = JSON.parse(routing.cookies['watching'])
watching.insert(0, project.fullname).uniq!
response.set_cookie('watching', watching.to_a.to_json)

# Deleting from session:
watching = JSON.parse(routing.cookies['watching'])
watching.delete(fullname)
response.set_cookie('watching', watching.to_a.to_json)
```
Requires manual JSON parse/serialize for every read and write.

### Roda: Sessions the Easy Way (session hash)
```ruby
# config/environment.rb
class App < Roda
  use Rack::Session::Cookie, secret: config.SESSION_SECRET
end

# app/controllers/app.rb
class App < Roda
  # Retrieve:
  session[:watching] ||= []

  # Add:
  session[:watching].insert(0, project.fullname).uniq!

  # Delete:
  session[:watching].delete(fullname)
end
```

`session` automatically serializes/deserializes data and manages cookie updating.

**Session secret**: must be 64 bytes, generated via `rake new_session_secret`. Prevents cookie tampering. Production secret must be set as environment variable (e.g., Heroku config).

---

## Flash Messages: Transferring Error State

### Problem
Routes encounter errors at multiple steps (parse input, retrieve from API, save to database). These errors must be communicated to the *next* view after a redirect — but a redirect is a new HTTP request, so state is lost unless stored somewhere.

### Solution: Flash Plugin
The flash plugin uses the session to store one-time status messages that survive exactly one redirect.

**Setup:**
```ruby
# config/environment.rb
use Rack::Session::Cookie, secret: config.SESSION_SECRET

# app/controllers/app.rb
class App < Roda
  plugin :flash
end
```

**Controller usage:**
```ruby
# flash — message survives to the NEXT view (stored in session):
flash[:error] = 'Project not found'
routing.redirect '/'

# flash.now — message only available in the CURRENT route's view:
flash.now[:notice] = 'Add a Github project to get started'

# Conventions:
# :notice  → success message (green)
# :error   → failure message (red/danger)
```

**Error checking patterns:**
```ruby
# Conditional check:
if project.nil?
  flash[:error] = 'Project not found'
  routing.redirect '/'
end

# Rescue unexpected errors:
begin
  gitrepo = GitRepo.new(project)
  gitrepo.clone! unless gitrepo.exists_locally?
rescue StandardError => error
  flash[:error] = 'Could not clone this project'
  routing.redirect '/'
end
```

**Flash bar view template (`flash_bar.slim`):**
```slim
- if flash[:error]
  div class="alert alert-danger" id="flash_bar_danger"
    = flash[:error]
- if flash[:notice]
  div class="alert alert-success" id="flash_bar_success"
    = flash[:notice]
```

**Inject flash bar into every page via layout (`layout.slim`):**
```slim
section
  include :flash_bar
  == yield
```

Use Bootstrap `alert` classes: `alert-danger` (red) for errors, `alert-success` (green) for notices.

---

## Interface Storyboarding

Lo-Fi storyboards are used to plan and communicate the presentation layer before implementation:

1. **Show** your major interfaces
2. **Indicate** content that users can interact with
3. **Show the flow** between pages/dialogs

**Interface Prototyping process:**
- **Draw and Discuss**: Draw your storyboard on a whiteboard with the team
- **Split and Spy**:
  - Split team — some members visit other teams as users, make suggestions; one stays to guide visitors
  - Switch roles so everyone gets to visit
- **Regroup and Share**: Discuss suggestions for your own application, share ideas seen from other teams, redesign interfaces based on feedback

---

## Testing the Presentation Layer

### Testing Hierarchy

| Type | What it tests | Scope |
|---|---|---|
| **Unit tests** | Individual classes and methods | Single class |
| **Integration tests** | Multiple units working together | Cross-layer |
| **Acceptance tests** | Entire system from user perspective | Full stack |

### Acceptance Tests
Test that the entire system works the way a user/client expects — ensuring functionality meets business requirements.

**Manual Testing:**
- Can identify violations in flow and usage
- Can spot aesthetic/design issues
- Can give subjective feedback
- Slow, expensive, cannot run at any time, prone to mistakes → breaks TDD and agile cycle

**Automated Testing:**
- Can identify violations in flow and usage
- Quick and inexpensive (fits TDD/agile)
- Cannot spot aesthetic issues or give subjective feedback

### Behavior Driven Development (BDD)

BDD is an approach to automated acceptance testing that focuses on **user stories** (use cases and scenarios) rather than code units. Think at the **feature level** and specify **behavior**, not implementation.

**Test categories:**
- **Happy**: everything goes as planned
- **Bad**: user gives invalid input
- **Sad**: input is valid but cannot be processed

**Structure — Given/When/Then:**
- **Given**: Setup the situation
- **When**: Conduct the action
- **Then**: Test the visible results

**Example BDD test:**
```ruby
describe 'Add Project' do
  it '(HAPPY) should be able to request a project' do
    # GIVEN: user is on the home page without any projects
    @browser.goto homepage

    # WHEN: they add a project URL and submit
    good_url = "https://github.com/#{USERNAME}/#{PROJECT_NAME}"
    @browser.text_field(id: 'url_input').set(good_url)
    @browser.button(id: 'project_form_submit').click

    # THEN: they should find themselves on the project's page
    @browser.url.include? USERNAME
    @browser.url.include? PROJECT_NAME
  end

  it '(BAD) should not be able to add an invalid project URL' do
    # GIVEN: user is on the home page
    @browser.goto homepage

    # WHEN: they request a project with an invalid URL
    bad_url = 'foobar'
    @browser.text_field(id: 'url_input').set(bad_url)
    @browser.button(id: 'project_form_submit').click

    # THEN: they should see a warning message
    _(@browser.div(id: 'flash_bar_danger').present?).must_equal true
    _(@browser.div(id: 'flash_bar_danger').text.downcase).must_include 'invalid'
  end

  it '(SAD) should not be able to add valid but non-existent project URL' do
    # GIVEN: user is on the home page
    @browser.goto homepage

    # WHEN: they add a project URL that is valid but non-existent
    sad_url = "https://github.com/#{USERNAME}/foobar"
    @browser.text_field(id: 'url_input').set(sad_url)
    @browser.button(id: 'project_form_submit').click

    # THEN: they should see a warning message
    _(@browser.div(id: 'flash_bar_danger').present?).must_equal true
    _(@browser.div(id: 'flash_bar_danger').text.downcase).must_include 'could not find'
  end
end
```

BDD tests drive against actual browser behavior — they verify the presentation layer end-to-end.

---

## API-Centric Presentation Layer

When the monolith evolves into an API-centric architecture, the Presentation Layer is **fully replaced**. The rule still holds — it never performs logic — but its components and output format change entirely.

| Monolith Component | API-Centric Replacement | Purpose |
|---|---|---|
| View Templates (Slim/ERB) | **Representers** (ROAR gem) | Serialize domain objects to JSON |
| View Objects | **Response Objects** | Shape the data for a specific API response |
| HTML body | **JSON body** | Client-agnostic output format |

### The Critical Identity Rule

> **Database Entity ≠ Domain Entity ≠ Entity Representation**

A Representer picks only the **relevant properties** for a use-case. It does not have to correspond to a domain entity exactly, and must not expose all internal data.

### Representers (ROAR Gem)

A Representer is a **Decorator Pattern** object that specifically serializes/deserializes domain objects to/from JSON (or XML). It lives in `app/presentation/representers/`.

```ruby
# app/presentation/representers/member_representer.rb
require 'roar/decorator'
require 'roar/json'

module CodePraise
  module Representer
    class Member < Roar::Decorator
      include Roar::JSON

      property :origin_id
      property :username
      # email deliberately excluded — not needed for this use-case
    end
  end
end
```

**Serialize (server → client):**
```ruby
member_json = Representer::Member.new(db_member).to_json
# => '{"origin_id":1926704,"username":"soumyaray"}'
```

**Deserialize (client → server):**
```ruby
member = Representer::Member.new(OpenStruct.new).from_json(member_json)
member.username  # => "soumyaray"
```

**Properties can be nested representers and collections:**
```ruby
class FileContributions < Roar::Decorator
  include Roar::JSON

  property :line_count
  property :file_path,    extend: Representer::FilePath,    class: OpenStruct
  property :credit_share, extend: Representer::CreditShare, class: OpenStruct
  collection :lines,        extend: Representer::LineContribution, class: OpenStruct
  collection :contributors, extend: Representer::Contributor,      class: OpenStruct
end
```

**Gemfile:**
```ruby
gem 'multi_json'  # JSON dependency for ROAR
gem 'roar'        # Resource-Oriented Architectures in Ruby
```

**File structure:**
```
app/presentation/
└── representers/
    ├── contributor_representer.rb
    ├── file_contributions_representer.rb
    ├── member_representer.rb
    ├── project_representer.rb
    └── projects_representer.rb
```

### HTTP Status Codes as Presentation Output

The API Presentation Layer communicates results via HTTP status codes — a convention between developers to convey the result of requests. Follow them precisely; research the best code for your case.

| Range | Meaning | Key Codes |
|---|---|---|
| **2xx** | Success | 200 OK, 201 Created, 204 No Content |
| **3xx** | Redirection | 301 Moved Permanently, 304 Not Modified |
| **4xx** | Client Error | 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Unprocessable Entity |
| **5xx** | Server Error | 500 Internal Server Error, 503 Service Unavailable |

### HATEOAS — Hypertext as the Engine of Application State

HATEOAS is the most defining aspect of REST. The server includes **links to next valid operations** inside each response body, so the client does not need to:
- Know the API server's resource routes
- Understand domain logic to determine which actions are valid

```json
{
  "account_number": 12345,
  "balance": { "currency": "usd", "value": 100.00 },
  "links": {
    "deposit":  "/accounts/12345/deposit",
    "withdraw": "/accounts/12345/withdraw",
    "close":    "/accounts/12345/close"
  }
}
```

**Why it matters:** Without HATEOAS, clients hardcode API routes. When domain logic or routes change, every client breaks. With HATEOAS, the server guides application state — clients follow links and remain robust to changes in the domain model.

---

## Summary: Presentation Layer Rules

1. **Output only, never logic.** The presentation layer renders data it has been given. It never decides what data to fetch, how to validate it, or what business rules apply.
2. The presentation layer lives entirely in `app/presentation/` and is independent of domain objects.
3. View templates contain **only layout code** — no domain logic, no string construction, no business rules.
4. View objects are the **sole adapter** between domain entities and templates — they format for display, not decide.
4. Session state is stored in cookies; use the `session` hash (not raw cookies) for automatic serialization.
5. Flash messages (`:notice` / `:error`) are the correct mechanism for communicating one-time status across a redirect.
6. Acceptance tests use BDD (Given/When/Then) with Happy/Bad/Sad scenarios to test the full presentation layer behavior automatically.
