import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();
import schedule from 'node-schedule';
import Reminder from '../models/ReminderModel.js';
import { transporter } from '../utils/transporter.js';
import moment from 'moment-timezone';
import { google } from 'googleapis';
import webPush from 'web-push';
import Subscription from '../models/SubscriptionModel.js';
import User from '../models/UserSchema.js';

// ----- Google API Setup -----
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const loadSavedToken = async (userId) => {
  try {
    // Get the token from the user's record in database
    const user = await User.findById(userId);
    if (!user || !user.googleRefreshToken) {
      throw new Error('No refresh token found for user');
    }

    oauth2Client.setCredentials({
      refresh_token: user.googleRefreshToken
    });

    return oauth2Client;
  } catch (err) {
    console.error('Error loading token:', err);
    throw err;
  }
};

// ----- Helper Functions for Meal Preparation -----

const hasValidPreparationSteps = (meal) => {
  return meal.preparationSteps &&
    Array.isArray(meal.preparationSteps) &&
    meal.preparationSteps.length > 0 &&
    meal.preparationSteps[0].steps &&
    Array.isArray(meal.preparationSteps[0].steps) &&
    meal.preparationSteps[0].steps.length > 0;
};

const formatPreparationSteps = (meal, format = 'text') => {
  if (!hasValidPreparationSteps(meal)) {
    return format === 'text'
      ? 'No preparation steps provided.'
      : '<li>No preparation steps provided.</li>';
  }

  const steps = meal.preparationSteps[0].steps;

  if (format === 'text') {
    return steps.map(({ stepNumber, instruction, duration }) =>
      `Step ${stepNumber}: ${instruction} (Duration: ${duration || 'N/A'})`
    ).join('\n');
  } else {
    return steps.map(({ stepNumber, instruction, duration }) => `
            <li>
                <strong>Step ${stepNumber}</strong>: ${instruction}
                <span style="color: #7f8c8d; font-style: italic; margin-left: 10px;">
                    (Duration: ${duration || 'N/A'})
                </span>
            </li>
        `).join('');
  }
};

// ----- Notification Functions -----

const sendEmailReminder = async (reminderId) => {
  try {
    const reminder = await Reminder.findById(reminderId)
      .populate({
        path: 'meal',
        select: 'name image ingredients preparationSteps',
        populate: [
          { path: 'ingredients', select: 'name' },
          {
            path: 'preparationSteps',
            select: 'description skillLevel steps',
            populate: {
              path: 'steps',
              select: 'stepNumber instruction duration _id'
            }
          }
        ]
      })
      .populate('user', 'email fullName');

    if (!reminder) {
      console.error(`Reminder with ID ${reminderId} not found.`);
      return false;
    }

    const { meal, user, reminderTime } = reminder;
    const ingredientNames = meal.ingredients.map(({ name }) => name).join(', ');
    const ingredientsList = meal.ingredients.map(({ name }) => `<li>${name}</li>`).join('');
    const textSteps = formatPreparationSteps(meal, 'text');
    const htmlSteps = formatPreparationSteps(meal, 'html');
    const formattedTime = new Date(reminderTime).toLocaleString();

    const mailOptions = {
      from: `"Meal Reminder" <${process.env.EMAIL_USER}>`,
      to: user.email,
      replyTo: process.env.EMAIL_USER,
      subject: `Meal Reminder: ${meal.name}`,
      text: `Hello ${user.fullName},

Just a reminder to prepare your meal: ${meal.name}

Meal Details:
- Image: ${meal.image || 'N/A'}
- Ingredients: ${ingredientNames}

Preparation Steps:
${textSteps}

Scheduled Time: ${formattedTime}

Enjoy your meal!`,
      html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Meal Reminder</title>
            </head>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #333;">Meal Reminder: ${meal.name}</h1>
                <p>Hello ${user.fullName},</p>
                <p>Just a reminder to prepare your delicious meal.</p>
                <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px;">
                    <h2 style="color: #2c3e50;">Meal Details</h2>
                    ${meal.image ? `
                    <div style="text-align: center; margin-bottom: 15px;">
                        <img src="${meal.image}" alt="${meal.name}" style="max-width: 300px; border-radius: 10px;">
                    </div>` : ''}
                    <h3 style="color: #34495e;">Ingredients</h3>
                    <ul style="list-style-type: disc; padding-left: 20px;">
                        ${ingredientsList}
                    </ul>
                    <h3 style="color: #34495e;">Preparation Steps</h3>
                    <ol style="padding-left: 20px; list-style: none;">
                        ${htmlSteps}
                    </ol>
                </div>
                <p style="margin-top: 15px;">
                    <strong>Scheduled Time:</strong> ${formattedTime}
                </p>
                <p style="color: #7f8c8d; font-style: italic;">Enjoy your meal!</p>
                <hr style="margin-top: 20px; border: 0; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #999;">
                    This is an automated reminder. Please do not reply to this email.
                </p>
            </body>
            </html>`
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email reminder:', error);
    if (error.response) {
      console.error('SMTP response failed:', error.response);
    }
    return false;
  }
};

const sendPushNotification = async (reminder) => {
  try {
    const subscription = await Subscription.findById(reminder.subscription).lean();
    if (!subscription) {
      console.error('No subscription found for the reminder');
      return false;
    }

    if (!subscription.keys || !subscription.keys.auth || !subscription.keys.p256dh) {
      console.error('Subscription missing required keys');
      return false;
    }

    const payload = JSON.stringify({
      title: `Meal Reminder: ${reminder.meal.name}`,
      body: `Hello! It's time to prepare your meal: ${reminder.meal.name}. Check the details in your app.`,
      icon: reminder.meal.image || '/public/favicon.ico',
      badge: '/public/favicon.ico',
      image: reminder.meal.image,
      data: {
        mealId: reminder.meal._id,
        url: `/meal/${reminder.meal._id}`,
        imageSize: {
          width: 150,
          height: 150
        }
      },
      vibrate: [200, 100, 200],
    });

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      }
    };

    await webPush.sendNotification(pushSubscription, payload);
    console.log('Push notification sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
};

const syncWithCalendar = async (reminder) => {
  try {
    const authClient = await loadSavedToken(reminder.user._id);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const ingredientsList = reminder.meal.ingredients
      .map(i => `- ${i.name}`)
      .join('\n');

    const stepsList = reminder.meal.preparationSteps
      .map((step, i) => `${i + 1}. ${step.instruction}`)
      .join('\n');

    const event = {
      summary: `Meal Reminder: ${reminder.meal.name}`,
      description: `Time to prepare: ${reminder.meal.name}\n\n` +
        `Ingredients:\n${ingredientsList}\n\n` +
        `Steps:\n${stepsList}`,
      start: {
        dateTime: reminder.reminderTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: moment(reminder.reminderTime)
          .add(1, 'hour')
          .toISOString(),
        timeZone: 'UTC'
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 30 },
          { method: 'popup', minutes: 15 }
        ]
      }
    };

    const calendarEvent = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: 'all'
    });

    // console.log(`Calendar synced for reminder ${reminder._id}: Event ID: ${calendarEvent.data.id}`);
    return true;
  } catch (error) {
    console.error('Error syncing with calendar:', error);
    return false;
  }
};

// ----- Reminder Scheduling Functions -----

const getNextReminderTime = (currentReminderTime, frequency) => {
  const nextTime = new Date(currentReminderTime);
  switch (frequency) {
    case 'daily':
      nextTime.setDate(nextTime.getDate() + 1);
      break;
    case 'weekly':
      nextTime.setDate(nextTime.getDate() + 7);
      break;
    case 'monthly':
      nextTime.setMonth(nextTime.getMonth() + 1);
      break;
    default:
      return null;
  }
  return nextTime;
};

const processReminder = async (reminder) => {
  try {
    reminder = await Reminder.findById(reminder._id)
      .populate('meal')
      .populate('subscription')
      .populate('user')
      .lean();

    if (!reminder) {
      console.error('Reminder not found when processing');
      return false;
    }

    let notificationSent = false;
    switch (reminder.notificationMethod) {
      case 'email':
        notificationSent = await sendEmailReminder(reminder._id);
        break;
      case 'push':
        notificationSent = await sendPushNotification(reminder);
        break;
      case 'calendar':
        notificationSent = await syncWithCalendar(reminder);
        break;
      default:
        console.log(`Unknown notification method: ${reminder.notificationMethod}`);
        return false;
    }

    if (notificationSent) {
      const updatedReminder = await Reminder.findById(reminder._id);
      if (updatedReminder.isRecurring && updatedReminder.recurringFrequency) {
        const nextReminderTime = getNextReminderTime(updatedReminder.reminderTime, updatedReminder.recurringFrequency);
        if (nextReminderTime) {
          updatedReminder.reminderTime = nextReminderTime;
          updatedReminder.notified = false;
          await updatedReminder.save();
          scheduleIndividualReminder(updatedReminder);
        } else {
          updatedReminder.isRecurring = false;
          updatedReminder.notified = true;
          await updatedReminder.save();
        }
      } else {
        updatedReminder.notified = true;
        await updatedReminder.save();
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error processing reminder:', error);
    return false;
  }
};

export const scheduleIndividualReminder = (reminder) => {
  const utcTime = moment.utc(reminder.reminderTime).toDate();
  const job = schedule.scheduleJob(utcTime, async () => {
    await processReminder(reminder);
  });
  return job;
};

export const createReminder = async (reminderData) => {
  const reminder = new Reminder(reminderData);
  await reminder.save();
  scheduleIndividualReminder(reminder);
  return reminder;
};

export const rescheduleReminder = async (reminder) => {
  if (reminder.job && typeof reminder.job.cancel === 'function') {
    reminder.job.cancel();
  }
  scheduleIndividualReminder(reminder);
};

export const initializeReminderSystem = async () => {
  try {
    console.log('Initializing reminder system...');
    const reminders = await Reminder.find({ notified: false });
    reminders.forEach((reminder) => {
      scheduleIndividualReminder(reminder);
    });
  } catch (error) {
    console.error('Error initializing reminder system:', error.message);
  }
};