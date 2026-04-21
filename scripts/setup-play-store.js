#!/usr/bin/env node
/**
 * Google Play Store Listing Setup Script
 * Uses the Android Publisher API v3 to configure:
 * - Store listing (title, descriptions)
 * - App details (category, contact info, default language)
 * - Upload icon & feature graphic images
 * 
 * Usage: node scripts/setup-play-store.js
 * 
 * Prerequisites:
 *   1. App must already be created in Google Play Console (draft is fine)
 *   2. Service account must have "Admin" or "Release manager" access in Play Console
 *      (Settings > API access > Grant access to the service account)
 *   3. Service account JSON key at ./cogoal-ff324dd0e375.json
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────────────────

const PACKAGE_NAME = 'com.cogoal.app';
const SERVICE_ACCOUNT_KEY = path.resolve(__dirname, '..', 'cogoal-ff324dd0e375.json');
const DEFAULT_LANGUAGE = 'en-US';

// Store listing content
const LISTING = {
  language: DEFAULT_LANGUAGE,
  title: 'CoGoals - Collaborative Goals',
  shortDescription:
    'Set goals together. Track progress. Stay accountable with your crew.',
  fullDescription: `CoGoal is the group goal-setting app that turns shared ambitions into real results.

Whether you're saving for a trip with your partner, training for a race with friends, or crushing quarterly targets with your team — CoGoal keeps everyone aligned, motivated, and accountable.

🎯 POWERFUL GOAL FRAMEWORKS
• Quarterly Cascading Goals – Break big objectives into monthly milestones & weekly actions
• OKRs – Set objectives with measurable key results
• SMART Goals – Guided setup with sequential milestones
• Habit Tracking – Build streaks for daily and weekly routines

👥 BUILT FOR GROUPS
• Create groups for couples, friends, families, or teams
• Everyone sets personal sub-goals that roll up to the shared objective
• Activity feed shows real-time progress from every member
• Reactions, comments, and encouragement keep motivation high

🏆 GAMIFICATION THAT WORKS
• Earn XP for logging actions, hitting streaks, and encouraging teammates
• Level up through Onboarding → Growth → Mastery → Prestige tiers
• Unlock badges like Streak Master, Team Player, and Goal Crusher
• Group leaderboards add friendly competition each cycle

📊 TRACK EVERYTHING
• Visual progress dashboards for individuals and groups
• Streak counters with bonus XP at 3, 7, and 30 days
• Milestone celebrations with animations and sounds
• Photo and note attachments as proof of progress

🔔 SMART REMINDERS
• Set your own check-in cadence — daily, every few days, or weekly
• Get notified when teammates log actions
• Celebrate together when milestones are reached

CoGoal is free to download. Start your first group goal today and see what you can achieve together.`,
};

// App details
const APP_DETAILS = {
  contactEmail: 'support@cogoal.app',
  contactWebsite: 'https://cogoal.app',
  defaultLanguage: DEFAULT_LANGUAGE,
};

// ─── Main Script ─────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Setting up Google Play Store listing for', PACKAGE_NAME);
  console.log('');

  // 1. Authenticate
  console.log('🔑 Authenticating with service account...');
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const authClient = await auth.getClient();
  const publisher = google.androidpublisher({ version: 'v3', auth: authClient });

  // 2. Create an edit
  console.log('📝 Creating new edit...');
  const { data: edit } = await publisher.edits.insert({
    packageName: PACKAGE_NAME,
    requestBody: {},
  });
  const editId = edit.id;
  console.log(`   Edit ID: ${editId}`);

  // 3. Set app details (contact info, default language)
  console.log('📋 Setting app details...');
  await publisher.edits.details.update({
    packageName: PACKAGE_NAME,
    editId,
    requestBody: APP_DETAILS,
  });
  console.log('   ✅ Contact email:', APP_DETAILS.contactEmail);
  console.log('   ✅ Contact website:', APP_DETAILS.contactWebsite);
  console.log('   ✅ Default language:', APP_DETAILS.defaultLanguage);

  // 4. Set store listing
  console.log('📝 Setting store listing...');
  await publisher.edits.listings.update({
    packageName: PACKAGE_NAME,
    editId,
    language: DEFAULT_LANGUAGE,
    requestBody: LISTING,
  });
  console.log('   ✅ Title:', LISTING.title);
  console.log('   ✅ Short description set (' + LISTING.shortDescription.length + ' chars)');
  console.log('   ✅ Full description set (' + LISTING.fullDescription.length + ' chars)');

  // 5. Upload images if they exist
  await uploadImageIfExists(publisher, editId, 'icon', 
    path.resolve(__dirname, '..', 'assets', 'icon.png'));
  
  // Check for feature graphic
  const featureGraphicPath = path.resolve(__dirname, '..', 'assets', 'feature-graphic.png');
  await uploadImageIfExists(publisher, editId, 'featureGraphic', featureGraphicPath);

  // Upload screenshots if directory exists
  const screenshotsDir = path.resolve(__dirname, '..', 'assets', 'screenshots');
  if (fs.existsSync(screenshotsDir)) {
    const screenshots = fs.readdirSync(screenshotsDir)
      .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
      .sort();
    
    if (screenshots.length > 0) {
      console.log('📸 Uploading screenshots...');
      for (const screenshot of screenshots) {
        const screenshotPath = path.join(screenshotsDir, screenshot);
        try {
          await publisher.edits.images.upload({
            packageName: PACKAGE_NAME,
            editId,
            language: DEFAULT_LANGUAGE,
            imageType: 'phoneScreenshots',
            media: {
              mimeType: 'image/png',
              body: fs.createReadStream(screenshotPath),
            },
          });
          console.log(`   ✅ Uploaded screenshot: ${screenshot}`);
        } catch (err) {
          console.warn(`   ⚠️  Failed to upload ${screenshot}:`, err.message);
        }
      }
    }
  } else {
    console.log('📸 No screenshots directory found at assets/screenshots/');
    console.log('   Create it and add phone screenshots to upload them.');
  }

  // 6. Commit the edit
  console.log('');
  console.log('💾 Committing edit...');
  await publisher.edits.commit({
    packageName: PACKAGE_NAME,
    editId,
  });
  console.log('   ✅ Edit committed successfully!');

  // 7. Print what still needs manual setup
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('✅ DONE — Store listing has been updated via API');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('📌 Items that require Play Console (not available via API):');
  console.log('   1. Content Rating — Fill out the questionnaire at:');
  console.log('      https://play.google.com/console → App content → Content rating');
  console.log('   2. App Category — Set under:');
  console.log('      Store presence → Main store listing → App category');
  console.log('      Recommended: Productivity or Lifestyle');
  console.log('   3. Privacy Policy URL — Required before publishing');
  console.log('   4. Target Audience & Content — Declare target age group');
  console.log('   5. Data Safety — Complete the data safety form');
  console.log('   6. Store listing assets — Add feature graphic & screenshots');
  console.log('      if not uploaded via this script');
  console.log('');
}

async function uploadImageIfExists(publisher, editId, imageType, imagePath) {
  if (!fs.existsSync(imagePath)) {
    console.log(`🖼️  No ${imageType} found at ${path.relative(process.cwd(), imagePath)}`);
    return;
  }

  console.log(`🖼️  Uploading ${imageType}...`);
  try {
    await publisher.edits.images.upload({
      packageName: PACKAGE_NAME,
      editId,
      language: DEFAULT_LANGUAGE,
      imageType,
      media: {
        mimeType: 'image/png',
        body: fs.createReadStream(imagePath),
      },
    });
    console.log(`   ✅ ${imageType} uploaded`);
  } catch (err) {
    console.warn(`   ⚠️  Failed to upload ${imageType}:`, err.message);
  }
}

// Run
main().catch((err) => {
  console.error('');
  console.error('❌ Error:', err.message);
  if (err.code === 403) {
    console.error('');
    console.error('Make sure the service account has been granted access in Play Console:');
    console.error('  Play Console → Settings → API access → Manage under your service account');
  }
  if (err.code === 404) {
    console.error('');
    console.error('App not found. Make sure you have created the app in Play Console first');
    console.error('and the package name matches:', PACKAGE_NAME);
  }
  process.exit(1);
});
