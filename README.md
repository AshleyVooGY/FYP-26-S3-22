# FYP-26-S3-22
# News Release System

A web-based news platform developed as part of the FYP-26-S3-22 Final Year Project. The system allows users to browse, publish and interact with news content while providing personalised discovery and administrative content-management functions.

## Project Status

This project is currently under development.

The present implementation phase covers:

* Feature 5: Trending and Popular News
* Feature 7: User Preference and Interest Management

The remaining approved features form part of the complete system scope and will be implemented progressively.

## System Features

| Feature                            | Description                                         |
| ---------------------------------- | --------------------------------------------------- |
| News Categorisation and Tagging    | Organises articles using categories and tags        |
| News Search and Filtering          | Allows users to search, filter and sort news        |
| Bookmark and Reading History       | Stores bookmarked and previously viewed articles    |
| News Reactions                     | Allows Registered Users to react to articles        |
| Trending and Popular News          | Ranks published articles using views and engagement |
| News Analytics and View Tracking   | Records views and presents article-performance data |
| Preference and Interest Management | Stores users’ selected news interests               |
| Article Media Management           | Supports image uploads for news articles            |
| Article Draft Management           | Allows unfinished articles to be saved privately    |
| Reading Accessibility              | Provides text-size and light/dark display settings  |

## User Roles

* **Guest User:** Browses, searches and reads published news.
* **Registered User:** Accesses personalised functions and manages personal content.
* **System Admin:** Manages users, classifications, content and analytics.

## Technology Stack

* **Frontend:** HTML, CSS and JavaScript
* **Backend service:** Supabase
* **Database:** PostgreSQL through Supabase
* **Authentication:** Supabase Authentication
* **Storage:** Supabase Storage
* **Version control:** GitHub

## Architecture

The frontend communicates with Supabase using the Supabase JavaScript client and Data API.

```text
Web interface
    ↓
JavaScript service layer
    ↓
Supabase Data API and Authentication
    ↓
PostgreSQL database and Storage
```

Supabase manages the hosted backend infrastructure, while the repository contains the frontend code, client-side service functions and version-controlled database scripts.

## Getting Started

### Prerequisites

* A modern web browser
* Git
* Access to the project repository
* Access to the shared Supabase project

### Clone the Repository

```bash
git clone https://github.com/AshleyYooGY/FYP-26-S3-22.git
cd FYP-26-S3-22
```

### Configure Supabase

Create a Supabase client configuration using the project URL and publishable key:

```javascript
import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const supabase = createClient(
  "YOUR_SUPABASE_PROJECT_URL",
  "YOUR_SUPABASE_PUBLISHABLE_KEY"
);
```

Only the Supabase Project URL and publishable key may be used in browser code.

Never commit:

* Database passwords
* Secret API keys
* Supabase `service_role` keys
* User login credentials

## Current Backend Implementation

The Supabase backend currently contains the database structures required for Trending and Popular News and Preference and Interest Management.

Feature 5 provides the following database functions:

| Function                                                | Purpose                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `get_trending_articles(result_limit)`                   | Retrieves ranked published articles from the trending period   |
| `get_popular_articles(result_limit)`                    | Retrieves ranked published articles across all available dates |
| `record_article_view(p_article_id, p_guest_session_id)` | Records valid article views and limits repeated counting       |

Database access is controlled using Row Level Security policies.

## Development Workflow

All development should be completed in feature branches. Changes must be reviewed and tested before being merged into `main`.

Recommended branch naming:

```text
feature/feature-name
fix/issue-description
docs/documentation-update
```

Example:

```text
feature/feature5-backend
feature/feature5-frontend
```

Use clear commit messages describing the change:

```text
feat: implement popular article ranking
fix: prevent duplicate article views
docs: update project setup instructions
```

## Documentation

The project’s requirements, designs, wireframes and technical decisions are maintained separately in the official project documentation.

## Contributors

Developed by the FYP-26-S3-22 project team. Team-member names, responsibilities and contribution details will be added during development.

## Academic Use

This repository was created for an academic Final Year Project. Project materials and source code should not be copied, redistributed or reused without permission from the project team.


