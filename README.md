# Jikan Anime Streaming Platform 

## Project Overview
Full-stack anime streaming platform with separate backend and frontend applications, featuring content aggregation from multiple providers, user authentication, and video streaming capabilities.

---

## Technical Stack
- **Backend**: Node.js, TypeScript, Hono framework, Cheerio for web scraping
- **Frontend**: React 19, TypeScript, Vite, Framer Motion, HLS.js
- **Database/Auth**: Supabase (PostgreSQL, OAuth authentication)
- **API Integration**: Jikan API (MyAnimeList), multiple streaming providers
- **Deployment**: Vercel (serverless functions)

---

## Resume Bullet Points

### Full-Stack Development
- Developed a full-stack anime streaming platform with separate backend and frontend applications using TypeScript, React 19, and Node.js
- Built a RESTful API backend using Hono framework with comprehensive error handling, CORS configuration, and health check endpoints
- Implemented a modular architecture with separate route handlers for multiple content providers (Jikan API, AnimeLok, DesiDubAnime, AnimeHindiDubbed)

### Backend Development
- Created a proxy server for Jikan API with rate limiting (3 requests/second, 60 requests/minute) to prevent API abuse
- Implemented web scraping capabilities using Cheerio to extract anime metadata from multiple streaming sources
- Designed and implemented RESTful API endpoints for anime search, details, recommendations, characters, and episodes
- Built streaming API routes to aggregate video content from multiple providers into a unified interface
- Configured CORS policies with proper headers for cross-origin requests and security

### Frontend Development
- Built a responsive React 19 application with TypeScript using Vite for fast development and optimized builds
- Implemented client-side routing with React Router for seamless navigation between pages (Home, Search, Player, Favorites, History)
- Created reusable UI components including AnimeCard, HeroBanner, Row, Navbar, Footer, and modals for consistent design
- Integrated Framer Motion for smooth page transitions and animations
- Implemented HLS.js for adaptive video streaming with support for multiple video qualities

### State Management & Data Handling
- Developed custom React hooks (useFavorites, useWatchHistory) for managing user-specific data with Supabase integration
- Implemented React Context API for authentication state management across the application
- Created protected routes to ensure only authenticated users can access favorites and watch history features
- Built efficient data fetching patterns with proper loading states and error handling

### Database & Authentication
- Integrated Supabase for PostgreSQL database storage and OAuth authentication (Google, GitHub providers)
- Designed database schema for user profiles, favorites, and watch history with proper relationships
- Implemented authentication flow with callback handling and session management
- Created type-safe database interfaces using TypeScript for compile-time type checking

### API Integration
- Integrated Jikan API (MyAnimeList) for comprehensive anime metadata including ratings, genres, and recommendations
- Built web scraping modules to extract streaming links from multiple anime providers
- Implemented search functionality with instant results and filtering capabilities
- Created API client with proper error handling and retry logic

### User Experience Features
- Implemented favorites system allowing users to save and manage their preferred anime titles
- Built watch history tracking with progress indicators for each episode
- Created continue watching section for quick access to partially watched content
- Designed responsive layout that works seamlessly on mobile, tablet, and desktop devices
- Implemented quick view modal for anime preview without leaving the current page

### Performance & Optimization
- Optimized build process using Vite for fast development server and production builds
- Implemented lazy loading and code splitting for improved initial load times
- Used TypeScript for type safety and reduced runtime errors
- Configured ESLint and Prettier for code quality and consistency

### Deployment & DevOps
- Deployed both backend and frontend to Vercel using serverless functions
- Configured environment variables for secure API key management
- Set up build scripts for TypeScript compilation and production optimization
- Implemented health check endpoints for monitoring application status

---

## Key Achievements
- Successfully integrated 4 different anime content providers into a unified streaming platform
- Built a scalable proxy server that handles rate limiting and caching for external APIs
- Created a type-safe full-stack application with comprehensive error handling
- Implemented user authentication and data persistence with Supabase
- Delivered a responsive, mobile-first design with smooth animations

---

## Technologies Used
- **Languages**: TypeScript, JavaScript
- **Frontend**: React 19, React Router, Framer Motion, HLS.js, Lucide React
- **Backend**: Node.js, Hono, Cheerio
- **Database**: Supabase (PostgreSQL)
- **Build Tools**: Vite, TypeScript Compiler
- **APIs**: Jikan API (MyAnimeList), OAuth providers
- **Deployment**: Vercel
- **Code Quality**: ESLint, Prettier

---

## Project Structure
```
jikan-backend/          # Node.js/TypeScript API server
├── src/
│   ├── routes/        # API route handlers
│   ├── lib/           # Provider integrations
│   └── server.ts      # Main server file

jikan-frontend/        # React 19 application
├── src/
│   ├── components/    # Reusable UI components
│   ├── pages/         # Page components
│   ├── contexts/      # React contexts
│   ├── hooks/         # Custom hooks
│   ├── lib/           # Utilities (Supabase client)
│   └── api/           # API client
```
