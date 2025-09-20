/**
 * Giftunity Telegram Bot Service
 * 
 * This is the user interface layer of the Giftunity platform.
 * It handles all Telegram interactions and communicates with the backend
 * service for business logic and data persistence.
 * 
 * Key Responsibilities:
 * - Handle Telegram webhook updates
 * - Process user commands and interactions
 * - Communicate with backend API for user management
 * - Serve translation content from backend
 * - Provide health checks for Render deployment
 * 
 * Environment Variables:
 * - TELEGRAM_BOT_TOKEN: Bot token from BotFather
 * - BACKEND_URL: Backend service URL
 * - WEBHOOK_URL: Bot webhook URL (provided by Render)
 * - PORT: Server port (default: 10001)
 * - NODE_ENV: Environment (production/development)
 */

const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express');

// Load environment variables
require('dotenv').config();

// Initialize Express app for webhook and health checks
const app = express();
const PORT = process.env.PORT || 10001;

// Middleware
app.use(express.json());

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'giftunity-bot',
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Giftunity Telegram Bot',
    version: '1.0.0',
    status: 'operational',
    webhook: 'configured'
  });
});

// Initialize Telegraf bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

/**
 * Backend API Communication Helper
 */
class BackendAPI {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  async findOrCreateUser(userData) {
    try {
      const response = await axios.post(`${this.baseURL}/api/user/findOrCreate`, userData, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Backend API Error - findOrCreateUser:', error.message);
      throw error;
    }
  }

  async getTranslations(language) {
    try {
      const response = await axios.get(`${this.baseURL}/api/translations/${language}`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error('Backend API Error - getTranslations:', error.message);
      throw error;
    }
  }

  async getSupportedLanguages() {
    try {
      const response = await axios.get(`${this.baseURL}/api/translations`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error('Backend API Error - getSupportedLanguages:', error.message);
      throw error;
    }
  }
}

// Initialize backend API client with proper URL formatting
const getBackendURL = () => {
  let backendURL = process.env.BACKEND_URL;
  
  // Ensure the backend URL has proper protocol
  if (backendURL && !backendURL.startsWith('http')) {
    backendURL = `https://${backendURL}`;
  }
  
  // Ensure the URL has the proper .onrender.com domain
  if (backendURL && !backendURL.includes('.onrender.com')) {
    backendURL = `${backendURL}.onrender.com`;
  }
  
  return backendURL;
};

const backendAPI = new BackendAPI(getBackendURL());

/**
 * Error Handler for Bot Operations
 */
const handleBotError = async (ctx, error, operation = 'operation') => {
  console.error(`Bot Error in ${operation}:`, error);
  
  try {
    // Try to get error message from backend translations
    const translations = await backendAPI.getTranslations('en');
    const errorMessage = translations.error_generic || 'An error occurred. Please try again later.';
    await ctx.reply(errorMessage);
  } catch (translationError) {
    // Fallback error message if translation service is down
    const fallbackMessage = `
🤖 <b>Giftunity Bot</b>

Sorry, I'm experiencing some technical difficulties right now. 

Please try again in a few moments, or contact support if the problem persists.

Thank you for your patience! 🙏
    `;
    await ctx.reply(fallbackMessage, { parse_mode: 'HTML' });
  }
};

/**
 * /start Command Handler
 * 
 * This is the main entry point for new users.
 * It handles user registration, language detection, and welcome message.
 */
bot.start(async (ctx) => {
  try {
    const user = ctx.from;
    console.log(`New user started bot: ${user.id} (${user.first_name})`);

    // Send user data to backend for processing
    const userRecord = await backendAPI.findOrCreateUser(user);
    
    // Get user's preferred language (defaults to 'en' if not set)
    const preferredLanguage = userRecord.preferred_language || 'en';
    
    // Get translations for the user's preferred language
    const translations = await backendAPI.getTranslations(preferredLanguage);
    
    // Send welcome message
    await ctx.reply(translations.welcome_message, {
      parse_mode: 'HTML'
    });

    console.log(`Welcome message sent to user ${user.id} in language ${preferredLanguage}`);
    
  } catch (error) {
    // If backend is not available, send a basic welcome message
    if (error.code === 'ERR_BAD_RESPONSE' || error.status === 500) {
      const fallbackWelcome = `
🤖 <b>Welcome to Giftunity!</b>

Hello ${ctx.from.first_name}! 👋

I'm your Giftunity assistant, here to help you manage gifts and share joy with others.

While I'm setting up some features, you can:
• Use /help to see available commands
• Use /language to change your language preference

Thank you for joining Giftunity! 🎁
      `;
      
      await ctx.reply(fallbackWelcome, { parse_mode: 'HTML' });
      console.log(`Fallback welcome message sent to user ${ctx.from.id}`);
    } else {
      await handleBotError(ctx, error, '/start command');
    }
  }
});

/**
 * /help Command Handler
 */
bot.help(async (ctx) => {
  try {
    const user = ctx.from;
    
    // Get user's preferred language
    const userRecord = await backendAPI.findOrCreateUser(user);
    const preferredLanguage = userRecord.preferred_language || 'en';
    const translations = await backendAPI.getTranslations(preferredLanguage);
    
    const helpMessage = `
🤖 <b>Giftunity Bot Help</b>

<b>Available Commands:</b>
/start - Start using Giftunity
/help - Show this help message
/language - Change your language preference

<b>About Giftunity:</b>
Giftunity is a platform for managing gifts and sharing joy with others.

<b>Support:</b>
If you need help, please contact our support team.
    `;
    
    await ctx.reply(helpMessage, { parse_mode: 'HTML' });
    
  } catch (error) {
    await handleBotError(ctx, error, '/help command');
  }
});

/**
 * /language Command Handler
 */
bot.command('language', async (ctx) => {
  try {
    const supportedLanguages = await backendAPI.getSupportedLanguages();
    
    const languageMessage = `
🌍 <b>Language Selection</b>

Supported languages:
• English (en)
• العربية (ar) - Arabic
• فارسی (fa) - Persian
• Русский (ru) - Russian
• Deutsch (de) - German
• 中文 (zh) - Chinese

To change your language, please contact support or use the web interface when available.
    `;
    
    await ctx.reply(languageMessage, { parse_mode: 'HTML' });
    
  } catch (error) {
    await handleBotError(ctx, error, '/language command');
  }
});

/**
 * Message Handler for Text Messages
 */
bot.on('text', async (ctx) => {
  try {
    const user = ctx.from;
    const messageText = ctx.message.text;
    
    // Log user message for analytics
    console.log(`User ${user.id} sent message: ${messageText}`);
    
    // For now, just acknowledge the message
    // In future phases, this will handle more complex interactions
    const userRecord = await backendAPI.findOrCreateUser(user);
    const preferredLanguage = userRecord.preferred_language || 'en';
    const translations = await backendAPI.getTranslations(preferredLanguage);
    
    await ctx.reply('Thank you for your message! More features are coming soon.', {
      parse_mode: 'HTML'
    });
    
  } catch (error) {
    await handleBotError(ctx, error, 'text message handling');
  }
});

/**
 * Error Handler for Bot
 */
bot.catch((err, ctx) => {
  console.error('Bot Error:', err);
  if (ctx) {
    ctx.reply('An unexpected error occurred. Please try again later.');
  }
});

/**
 * Webhook Configuration for Production
 */
if (process.env.NODE_ENV === 'production') {
  // Set webhook for production deployment
  // Ensure the webhook URL has the proper protocol and domain
  let baseURL = process.env.WEBHOOK_URL;
  
  console.log(`🔧 Initial webhook URL from env: ${baseURL}`);
  
  // Fix common webhook URL issues
  if (!baseURL || !baseURL.startsWith('http')) {
    // Fallback to using the service name if WEBHOOK_URL is not properly set
    const serviceName = process.env.RENDER_SERVICE_NAME || 'giftunity-bot-zh1r';
    baseURL = `https://${serviceName}`;
    console.log(`🔄 Using fallback service name: ${baseURL}`);
  }
  
  // Ensure the URL has the proper .onrender.com domain
  if (!baseURL.includes('.onrender.com')) {
    baseURL = `${baseURL}.onrender.com`;
    console.log(`🔧 Added .onrender.com domain: ${baseURL}`);
  }
  
  const webhookURL = `${baseURL}/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  console.log(`🔗 Final webhook URL: ${webhookURL}`);
  
  // Configure webhook
  bot.telegram.setWebhook(webhookURL).then(() => {
    console.log(`✅ Webhook set to: ${webhookURL}`);
  }).catch((error) => {
    console.error('❌ Failed to set webhook:', error);
  });

  // Webhook endpoint for receiving updates
  app.use(bot.webhookCallback(`/bot${process.env.TELEGRAM_BOT_TOKEN}`));
  
  console.log(`🚀 Bot running in production mode with webhook`);
} else {
  // Polling mode for development
  bot.launch().then(() => {
    console.log(`🚀 Bot running in development mode with polling`);
  }).catch((error) => {
    console.error('❌ Failed to launch bot:', error);
  });
}

/**
 * Graceful Shutdown Handlers
 */
const safeStop = (signal) => {
  try {
    console.log(`${signal} received, stopping bot...`);
    // In webhook mode Telegraf isn't launched via launch(); stop() can throw.
    if (typeof bot.stop === 'function') {
      try { bot.stop(signal); } catch (e) {
        console.warn(`bot.stop() skipped: ${e && e.message ? e.message : e}`);
      }
    }
  } finally {
    process.exit(0);
  }
};

process.once('SIGINT', () => safeStop('SIGINT'));
process.once('SIGTERM', () => safeStop('SIGTERM'));

/**
 * Start Express Server
 */
app.listen(PORT, () => {
  console.log(`🌐 Bot web server running on port ${PORT}`);
  console.log(`📊 Health check available at: http://localhost:${PORT}/health`);
  console.log(`🤖 Bot token configured: ${process.env.TELEGRAM_BOT_TOKEN ? 'Yes' : 'No'}`);
  console.log(`🔗 Backend URL: ${getBackendURL() || 'Not configured'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { bot, app };
