# Jikan Anime Streaming Platform - Product Requirements Document

## Project Overview
Full-stack anime streaming platform with separate backend and frontend applications, featuring content aggregation from multiple providers, user authentication, and video streaming capabilities.

## Target Users
- Anime enthusiasts who want to stream anime content
- Users who want to track their watch history and favorites
- Users who want to discover new anime through search and recommendations

## Core Features

### 1. Content Browsing
- Home page with hero banner and anime rows
- Latest episodes page
- TV series listing
- Movies listing
- Schedule page for release dates
- Browse by categories

### 2. Search & Discovery
- Search with query parameters
- Filter by genre, type, year
- Instant search results

### 3. Anime Details
- Synopsis and metadata display
- Character information
- Episode list
- Quick view modal

### 4. Video Player
- HLS adaptive streaming
- Quality selection
- Fullscreen support
- Episode navigation

### 5. User Authentication
- OAuth login (Google, GitHub)
- Session management
- Protected routes for favorites and history

### 6. User Features
- Favorites management
- Watch history tracking
- Continue watching section

## User Interactions
- Click navigation links to browse categories
- Type in search bar to find anime
- Click anime card to view details
- Click episode to start playing
- Click heart to add/remove favorites
- View watch history on profile page

## Technical Requirements
- React 19 with TypeScript
- Vite for build tooling
- Supabase for authentication and database
- HLS.js for video streaming
- Framer Motion for animations
- React Router for navigation

## Success Criteria
- Users can browse and discover anime content
- Users can search and filter anime
- Users can watch anime episodes with streaming
- Users can authenticate and manage favorites/history
- Application is responsive across devices