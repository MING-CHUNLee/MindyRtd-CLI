---
name: mvc-architecture
description: Rigorous reference for MVC Architecture patterns in Service Oriented Architecture (SOA), focusing on Enterprise Design Patterns: Gateway, Data Mapper, and Domain Entity. Use this skill whenever the user asks about gateway pattern, data mapper pattern, domain entity, how to separate data sourcing from data parsing, how to decouple external APIs from domain objects, how to structure models in MVC, what belongs in gateways vs mappers vs entities, how to refactor a God Object, or how to organize lib/ with entities/gateways/mappers folders. Trigger on questions like "what is a gateway", "what is a data mapper", "what is a domain entity", "where does business logic go", "how do I separate my API code from my models", "how do I decouple my entity from my data source", "what is the difference between gateway and mapper", or "how do I apply enterprise architecture patterns".
---

# MVC Architecture — Enterprise Design Patterns

> Source: SOA Week 7 — "MVC Architecture" lecture (Service Oriented Architecture course)

This skill covers the three **Enterprise Architecture Patterns** used in the Model layer of MVC: **Gateway**, **Data Mapper**, and **Domain Entity**. Together they solve the problem of integrating multiple data sources (APIs, databases) while keeping business logic clean and decoupled.

---

## The Core Problem: Why Split the Model?

A single "God Object" that handles getting data, parsing it, and running business logic is:
- **Hard to change** — where do you update HTTP or parsing details?
- **Hard to reuse** — can you swap to a different API or database?

The solution is to split responsibilities across three focused objects.

---

## Three Enterprise Design Patterns

| Pattern | Responsibility | Layer Label | Files |
|---|---|---|---|
| **Domain Entity** | Business logic (validation, rules, actions) | *business logic* | `lib/entities/` |
| **Data Mapper** | Translates gateway ↔ entity | *data parsing* | `lib/mappers/` |
| **Gateway** | Talks to data store (query, get, write) | *data sourcing* | `lib/gateways/` |

---

## Gateway

### Definition
> **Talks to data store**
> - Query data source
> - Get data
> - Write data

The Gateway is an object responsible for **data sourcing** — all direct communication with an external data store (API, database, file system). It speaks the **external system's own language** and returns native data structures.

### Key Rules
- Uses the **external API's own language** (e.g., "repos", "contributors" — not your project's "projects", "members")
- Returns **native data structures** (Hash/Array from parsed JSON — follows the external schema)
- Specializes in **HTTP interactions** (handles auth tokens, error codes, etc.)
- **Does NOT know** who calls it — agnostic to mappers and domain
- **Do NOT** change the external data schema
- **Do NOT** use your own project's domain language inside the gateway

### Example: `lib/gateways/github_api.rb`
```ruby
module CodePraise
  module Github
    # Gateway for Github Web API
    class Api
      def initialize(token)
        @gh_token = token
      end

      # Uses external API language: "repo", "contributors" (not "project", "members")
      def repo_data(username, project_name)
        # ...sends HTTP request, returns Hash/Array from JSON
      end

      def contributors_data(contributors_url)
        # ...sends HTTP request, returns Hash/Array from JSON
      end

      class Request
        REPOS_PATH = 'https://api.github.com/repos/'.freeze
        # HTTP request details...
      end

      # Decorates HTTP responses with success/error handling
      class Response < SimpleDelegator
        Unauthorized = Class.new(StandardError)
        NotFound     = Class.new(StandardError)
        HTTP_ERROR   = { 401 => Unauthorized, 404 => NotFound }.freeze

        def successful? = ...
        def error       = ...
      end
    end
  end
end
```

### What Gateway Returns
- Raw `Hash` / `Array` (parsed JSON)
- Data follows the **external schema** (e.g., GitHub's field names)

---

## Data Mapper

### Definition
> **Translates gateway ↔ entity**
> - Load/save/create/delete data from source
> - Convert between data and entities

The Data Mapper is responsible for **data parsing** — it sits between the Gateway and the Domain Entity and translates language between the two sides. It knows a lot about both, and is the only object that does.

### Key Rules
- Initialized with a **gateway object** (dependency injection)
- Provides a `find` method (find resources with identifiers)
- Provides a `build_entity` method (construct domain entity from raw data)
- Translates **external language → domain language** (e.g., `repo` → `project`, `contributors` → `members`)
- Is the **sole place** where gateway schema maps to entity attributes

### Example: `lib/mappers/project_mapper.rb`
```ruby
module CodePraise
  module Github
    # Data Mapper: Github repo -> Project entity
    class ProjectMapper
      def initialize(gh_token, gateway_class = Github::Api)
        @token         = gh_token
        @gateway_class = gateway_class
        @gateway       = gateway_class.new(@token)
      end

      # Find resource with identifiers → returns Domain Entity
      def find(owner_name, project_name)
        data = @gateway.repo_data(owner_name, project_name)
        build_entity(data)
      end

      def build_entity(data)
        DataMapper.new(data, @token, @gateway_class).build_entity
      end

      # Extracts entity-specific elements from raw data structure
      class DataMapper
        def initialize(data, token, gateway_class)
          @data = data
          # ...
        end

        def build_entity
          CodePraise::Entity::Project.new(
            id:      nil,
            origin_id: origin_id,   # maps @data fields to entity attributes
            name:    name,
            size:    size,
            git_url: git_url,
            owner:   owner,         # nested entity
            members: members        # array of Member entities
          )
        end

        # Original parsing methods (extract fields from @data Hash)
        def origin_id = ...
        def name      = ...
        def size      = ...
        def owner     = ...
        def git_url   = ...
        def members   = ...
      end
    end
  end
end
```

### Testing: Tests should call Data Mappers
```ruby
# spec/gateway_github_spec.rb
it 'HAPPY: should provide correct project attributes' do
  project = CodePraise::Github::ProjectMapper
    .new(GITHUB_TOKEN, Github::Api)
    .find(USERNAME, PROJECT_NAME)

  _(project.size).must_equal CORRECT['size']
  _(project.git_url).must_equal CORRECT['git_url']
end
```

---

## Domain Entity

### Definition
> **Logic of business entity**
> - Validation
> - Decisions and Rules
> - Domain Actions

The Domain Entity is the **heart of the business logic** — it represents a real-world concept in your domain (Project, Member) with strict data types and custom rules. It does **not** know where its data comes from.

### Key Rules
- Uses the **language of your project domain** (e.g., `project`, `members` — not `repo`, `contributors`)
- Implements **type validation** via `dry-struct` + `dry-types` gems
- Attributes can be optional or required with strict types
- Contains **custom business rule methods** (e.g., `too_large?`)
- Is **immutable** — cannot be changed after creation (Dry::Struct)
- Does NOT know who creates it or what data source it came from

### Example: `lib/entities/project.rb`
```ruby
module CodePraise
  module Entity
    class Project < Dry::Struct
      include Dry::Types

      attribute :id,        Integer.optional
      attribute :origin_id, Strict::Integer
      attribute :name,      Strict::String
      attribute :size,      Strict::Integer
      attribute :git_url,   Strict::String
      attribute :owner,     Member             # nested entity type
      attribute :members,   Strict::Array.of(Member)

      # Custom business rule
      def too_large?
        size > 1000
      end
    end
  end
end
```

### Example: `lib/entities/member.rb`
```ruby
module CodePraise
  module Entity
    class Member < Dry::Struct
      include Dry::Types

      attribute :id,        Integer.optional
      attribute :origin_id, Strict::Integer
      attribute :username,  Strict::String
      attribute :email,     Strict::String.optional
    end
  end
end
```

---

## Decoupling: How the Three Patterns Work Together

```
Domain Entities          "Agnostic" to mappers and data source
  Entity::Project  ←──────────────────────────────────────────┐
  Entity::Member   ←──────┐                                   │
                           │                                   │
Data Mappers         bridges both sides                        │
  Github::ProjectMapper ───┤                                   │
  Github::MemberMapper  ───┤                                   │
                           │                                   │
Gateways                   └── "Agnostic" to mappers and domain
  Github::Api ──── HTTP ──→ Github Web API
```

- **Entities** do not know where data comes from
- **Gateways** do not know the context of the domain
- **Data Mappers** bridge the two — they are the only place that knows both
- Change in external API → update **gateway + datamapper**
- Change in entity data structure → update **entities + datamapper**

---

## Folder Structure

```
lib/
├── entities/
│   ├── member.rb
│   └── project.rb
├── gateways/
│   └── github_api.rb
└── mappers/
    ├── member_mapper.rb
    └── project_mapper.rb
```

In an MVC Web App, these move into `app/models/`:
```
app/models/
├── entities/
├── gateways/
└── mappers/
```

---

## Summary: Pattern Responsibilities

| Question | Answer |
|---|---|
| Where does HTTP/API communication go? | **Gateway** |
| Where does JSON parsing / field mapping go? | **Data Mapper** |
| Where does business logic / validation go? | **Domain Entity** |
| Which object uses the external API's language? | **Gateway** |
| Which object uses your domain's language? | **Domain Entity** |
| Which object knows about both sides? | **Data Mapper** |
| What if the external API changes? | Update Gateway + Data Mapper |
| What if domain structure changes? | Update Entity + Data Mapper |
