# Meal Master API

A RESTful API for the Meal Master application that handles meal planning, reminders, shopping lists, and more.

## Features

- Authentication and Authorization
- Meal Management
- Shopping Lists
- Order Processing
- Push Notifications
- Email Reminders
- Google Calendar Integration
- Payment Processing (Stripe)
- Blog Management
- User Management
- Cart Management

## Tech Stack

- Node.js
- Express.js
- MongoDB with Mongoose
- JWT Authentication
- Google OAuth2
- Cloudinary for Image Storage
- Node-schedule for Reminders
- Web Push for Notifications
- Stripe for Payments

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB
- npm or yarn

### Installation

1. Clone the repository:
   \`\`\`bash
   git clone https://github.com/yourusername/mealmaster-api.git
   cd mealmaster-api
   \`\`\`

2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Create a .env file based on .env and fill in your values:
   \`\`\`bash
   cp .env .env
   \`\`\`

4. Start the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

### API Documentation

Base URL: \`/api/v1\`

#### Authentication Endpoints

- POST \`/auth/register\` - Register a new user
- POST \`/auth/login\` - Login user
- GET \`/auth/logout\` - Logout user
- GET \`/auth/google\` - Google OAuth login
- GET \`/auth/google/callback\` - Google OAuth callback

#### Meal Endpoints

- GET \`/meals\` - Get all meals
- GET \`/meals/:id\` - Get single meal
- POST \`/meals\` - Create meal (Admin)
- PATCH \`/meals/:id\` - Update meal (Admin)
- DELETE \`/meals/:id\` - Delete meal (Admin)

#### Shopping List Endpoints

- POST \`/shoppingLists\` - Create shopping list
- GET \`/shoppingLists\` - Get user's shopping lists
- PATCH \`/shoppingLists/:id\` - Update shopping list
- DELETE \`/shoppingLists/:id\` - Delete shopping list

#### Order Endpoints

- POST \`/orders/place\` - Place order
- GET \`/orders\` - Get all orders (Admin)
- GET \`/orders/user/:userId\` - Get user orders
- PATCH \`/orders/:orderId/status\` - Update order status (Admin)

#### Reminder Endpoints

- POST \`/reminders\` - Create reminder
- GET \`/reminders\` - Get user reminders
- PATCH \`/reminders/:id\` - Update reminder
- DELETE \`/reminders/:id\` - Delete reminder

For more detailed API documentation, visit the root endpoint (\`/\`) when the server is running.

### Deployment

The API is configured for deployment on Vercel. Simply push to your repository and connect it to Vercel for automatic deployments.

### Environment Variables

See \`.env\` for all required environment variables.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
