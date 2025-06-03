//PACKAGE IMPORTS
import * as dotenv from 'dotenv';
dotenv.config();
import express from 'express';
const app = express();
import 'express-async-errors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import cloudinary from 'cloudinary';
import helmet from 'helmet';
import { initializeReminderSystem } from './controllers/ScheduleReminders.js';
import cors from 'cors';
import { validateGoogleConfig } from './utils/configValidation.js';
import { generateSitemap } from './utils/sitemapGenerator.js';

//CUSTOM IMPORTS
//routers
import authRouter from './routes/authRoutes.js';
import mealRouter from './routes/MealRoutes.js';
import blogRouter from './routes/BlogRoutes.js';
import ingredientRouter from './routes/ingredientRoutes.js';
import preparationRouter from './routes/prepStepRoutes.js';
import shoppingListsRouter from './routes/shoppingListRoutes.js';
import ordersRouter from './routes/OrderRoutes.js';
import reminderRoutes from './routes/ReminderRoutes.js';
import reviewRoutes from './routes/ReviewRoutes.js';
import userRoutes from './routes/UserRoutes.js';
import cartRoutes from './routes/CartRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';

//public
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

//Middleware
import errorHandlerMiddleware from './middleware/errorHandlerMiddleware.js';

import { handleStripeWebhook } from './controllers/paymentControllers.js';

// Validate required configurations
try {
  validateGoogleConfig();
} catch (error) {
  console.error('Configuration Error:', error.message);
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const __dirname = dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

initializeReminderSystem(); // Start the reminder scheduler

// API CORS configuration
// app.use(cors({
//   origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// }));

app.use(cors({
  origin: ['https://client-amber-nu.vercel.app', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// IMPORTANT: Add the Stripe webhook route BEFORE the JSON body parser
// This ensures the raw body is available for Stripe signature verification
app.post('/api/v1/payment/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);


app.use(express.json());
app.use(cookieParser());
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "https://res.cloudinary.com"],
      // you might need to include other sources too
    },
  })
);

// Sitemap endpoint
app.get('/sitemap.xml', async (req, res) => {
  try {
    const baseURL = `${req.protocol}://${req.get('host')}`;
    const sitemap = await generateSitemap(baseURL);
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).send('Error generating sitemap');
  }
});


// app.get('/', (req, res) => {
//   res.send('hello world');
// });

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/meals', mealRouter);
app.use('/api/v1/blogs', blogRouter);
app.use('/api/v1/ingredients', ingredientRouter);
app.use('/api/v1/preparationSteps', preparationRouter);
app.use('/api/v1/shoppingLists', shoppingListsRouter);
app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/reminders', reminderRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/payment', paymentRoutes);

// API Documentation Route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Meal Master API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      meals: '/api/v1/meals',
      blogs: '/api/v1/blogs',
      ingredients: '/api/v1/ingredients',
      preparationSteps: '/api/v1/preparationSteps',
      shoppingLists: '/api/v1/shoppingLists',
      orders: '/api/v1/orders',
      reminders: '/api/v1/reminders',
      reviews: '/api/v1/reviews',
      users: '/api/v1/users',
      cart: '/api/v1/cart',
      payment: '/api/v1/payment'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource does not exist'
  });
});

app.use(errorHandlerMiddleware);

const port = process.env.PORT || 5000;

try {
  await mongoose.connect(process.env.MONGO_URL);
  app.listen(port, '0.0.0.0', () => {
    console.log(`server running on PORT ${port}...`);

  });
} catch (error) {
  console.log(error);
  process.exit(1);
}
