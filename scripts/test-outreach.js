/**
 * Dry-run / live test of weekly club outreach without touching the Firestore queue.
 *
 * Usage:
 *   node scripts/test-outreach.js --channel=package
 *   node scripts/test-outreach.js --channel=discord
 *   node scripts/test-outreach.js --channel=bluesky
 *   node scripts/test-outreach.js --channel=all
 *
 * Optional:
 *   --name="Ballionaire"
 *   --url="https://store.steampowered.com/app/2667120"
 *   --header="https://…/header.jpg"
 *   --icon="https://…/icon.jpg"
 *
 * Discord needs: DISCORD_BOT_TOKEN, DISCORD_FORUM_CHANNEL_ID,
 *   DEV_CLUB_ROLE_ID, DISCORD_ANNOUNCE_CHANNEL_ID
 * Bluesky needs: BLUESKY_HANDLE, BLUESKY_APP_PASSWORD
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const CLUB_URL = 'https://pakgamedev.com/club';
const DISCORD_INVITE = 'https://pakgamedev.com/discord';
const COVER_URL =
  'https://pakgamedev.com/gameclubactions/outreach/weekly-cover.png';
const ACTIVE_TAG = '1455828972339331146';

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const channel = arg('channel', 'package');
const game = {
  name: arg('name', 'Ballionaire'),
  url: arg('url', 'https://store.steampowered.com/app/2667120/Ballionaire/'),
  header_image: arg(
    'header',
    'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2667120/header.jpg'
  ),
  icon_image: arg('icon', ''),
  doc_id: 'ballionaire-test',
};

function repoRoot() {
  return path.join(__dirname, '..');
}

function buildOutreach(game, threadUrl) {
  const deadlineNote =
    'Everyone has until Sunday 11pm PKT to play, review, and discuss.';
  const kingLine =
    'As Stephen King says "If you want to be a writer, you must do two things above all others: read a lot and write a lot." We aim to play a lot of games and make a lot of games.';
  const weeklyHook =
    "Every week we'll play one game, take notes, analyze it as a developer, and discuss on Discord.";

  const body = [
    weeklyHook,
    kingLine,
    `This week we are playing ${game.name}.`,
    deadlineNote,
    `This week's Discord thread: ${threadUrl}`,
    `Join Discord: ${DISCORD_INVITE}`,
    `More: ${CLUB_URL}`,
  ].join('\n\n');

  const shortCaption = [
    weeklyHook,
    kingLine,
    `This week we are playing ${game.name}.`,
    deadlineNote,
    `Discuss: ${threadUrl}`,
    `More: ${CLUB_URL}`,
  ].join('\n');

  const youtubeBlurb = shortCaption;

  let blueskyText = [
    weeklyHook,
    `This week we are playing ${game.name}.`,
    deadlineNote,
    `This week's Discord thread: ${threadUrl}`,
    `Join Discord: ${DISCORD_INVITE}`,
    `More: ${CLUB_URL}`,
  ].join('\n');
  if ([...blueskyText].length > 300) {
    blueskyText = [
      weeklyHook,
      `This week we are playing ${game.name}.`,
      deadlineNote,
      `Join Discord: ${DISCORD_INVITE}`,
      `More: ${CLUB_URL}`,
    ].join('\n');
  }

  return {
    reddit: {
      title: `We are playing ${game.name} - Weekly Pakistan Game Dev Club`,
      body,
      header_image: game.header_image || '',
      cover_image: COVER_URL,
      club_url: CLUB_URL,
      discord_thread_url: threadUrl,
      game_url: game.url || '',
      game_name: game.name,
    },
    bluesky: {
      text: blueskyText,
      club_url: CLUB_URL,
      discord_thread_url: threadUrl,
      header_image: game.header_image || '',
      cover_image: COVER_URL,
      game_name: game.name,
    },
    shortCaption,
    youtubeBlurb,
    body,
  };
}

function buildWeeklyCover(game) {
  const script = path.join(repoRoot(), 'scripts', 'build_weekly_cover.py');
  const outDir = path.join(repoRoot(), 'outreach');
  const args = [script, '--name', game.name, '--out-dir', outDir];
  if (game.header_image) args.push('--image-url', game.header_image);
  const result = spawnSync('python3', args, { encoding: 'utf8' });
  if (result.stdout) console.log(result.stdout.trim());
  if (result.status !== 0) {
    throw new Error(result.stderr || `cover build failed (${result.status})`);
  }
}

function writePackage(outreach) {
  const root = repoRoot();
  const outreachDir = path.join(root, 'outreach');
  fs.mkdirSync(outreachDir, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'reddit-auto-post', 'post.json'),
    JSON.stringify(outreach.reddit, null, 2) + '\n'
  );
  fs.writeFileSync(
    path.join(outreachDir, 'bluesky.json'),
    JSON.stringify(outreach.bluesky, null, 2) + '\n'
  );
  const weeklyMd = [
    `# Weekly Game Dev Club — ${game.name} (TEST)`,
    '',
    '## Reddit title',
    outreach.reddit.title,
    '',
    '## Reddit / LinkedIn body',
    '```',
    outreach.body,
    '```',
    '',
    '## Short caption (IG / TikTok)',
    '```',
    outreach.shortCaption,
    '```',
    '',
    '## YouTube',
    '```',
    outreach.youtubeBlurb,
    '```',
    '',
    '## Bluesky',
    '```',
    outreach.bluesky.text,
    '```',
    '',
    `Cover: ${COVER_URL}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outreachDir, 'weekly.md'), weeklyMd);
  console.log('Wrote outreach/weekly.md, outreach/bluesky.json, reddit-auto-post/post.json');
}

async function postDiscord(game) {
  const {
    DISCORD_BOT_TOKEN,
    DISCORD_FORUM_CHANNEL_ID,
    DEV_CLUB_ROLE_ID,
    DISCORD_ANNOUNCE_CHANNEL_ID,
  } = process.env;

  const missing = [
    'DISCORD_BOT_TOKEN',
    'DISCORD_FORUM_CHANNEL_ID',
    'DEV_CLUB_ROLE_ID',
    'DISCORD_ANNOUNCE_CHANNEL_ID',
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(', ')}`);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(DISCORD_BOT_TOKEN);

  return new Promise((resolve, reject) => {
    client.once('ready', async () => {
      try {
        const channel = await client.channels.fetch(DISCORD_FORUM_CHANNEL_ID);
        const now = new Date();
        const sunday = new Date(now);
        const daysUntilSunday = (7 - now.getUTCDay()) % 7;
        sunday.setUTCDate(now.getUTCDate() + daysUntilSunday);
        sunday.setUTCHours(18, 0, 0, 0);
        const unixTimestamp = Math.floor(sunday.getTime() / 1000);

        const embed = new EmbedBuilder()
          .setTitle(`Current Game: ${game.name}`)
          .setURL(game.url)
          .setImage(game.header_image)
          .addFields(
            { name: 'Link', value: `[Open store page](${game.url})` },
            { name: 'Club board', value: CLUB_URL }
          )
          .setFooter({ text: 'Weekly Game · TEST' })
          .setTimestamp();
        if (game.icon_image) embed.setThumbnail(game.icon_image);

        const thread = await channel.threads.create({
          name: `[TEST] ${game.name}`,
          appliedTags: [ACTIVE_TAG],
          message: {
            content: [
              `<@&${DEV_CLUB_ROLE_ID}> Download the game, play it and take notes.`,
              "Pay attention to what the game is trying to do? What do you like about it? What you don't like? and really dig deep into why?",
              `Deadline: <t:${unixTimestamp}:f>`,
              `Pick the next game: ${CLUB_URL}`,
            ].join('\n'),
            embeds: [embed],
          },
        });

        const threadUrl = `https://discord.com/channels/${thread.guildId}/${thread.id}`;
        const forumChannelLink = `https://discord.com/channels/${thread.guildId}/${DISCORD_FORUM_CHANNEL_ID}`;

        const announceChannel = await client.channels.fetch(
          DISCORD_ANNOUNCE_CHANNEL_ID
        );
        await announceChannel.send(
          `Check out the latest game in ${forumChannelLink} : ${threadUrl}\n` +
            `Pick the next game: ${CLUB_URL}`
        );

        console.log('Discord forum thread:', threadUrl);
        console.log('Discord announce sent.');
        client.destroy();
        resolve(threadUrl);
      } catch (err) {
        client.destroy();
        reject(err);
      }
    });
  });
}

async function postBluesky() {
  const result = spawnSync('node', [path.join(__dirname, 'post-bluesky.js')], {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.stdout) console.log(result.stdout.trim());
  if (result.status !== 0) {
    throw new Error(result.stderr || `bluesky failed (${result.status})`);
  }
}

async function run() {
  console.log(`\n=== Testing channel: ${channel} ===`);
  console.log(`Game: ${game.name}`);

  if (channel === 'package' || channel === 'all' || channel === 'reddit' || channel === 'social') {
    console.log('\n[1] Building cover + outreach package…');
    buildWeeklyCover(game);
    const placeholderThread =
      'https://discord.com/channels/1263723973603102802/0000000000000000000';
    const outreach = buildOutreach(game, placeholderThread);
    writePackage(outreach);
    console.log('\n--- Reddit title ---\n' + outreach.reddit.title);
    console.log('\n--- Reddit / LinkedIn body ---\n' + outreach.body);
    console.log('\n--- IG / TikTok short caption ---\n' + outreach.shortCaption);
    console.log('\n--- Bluesky text ---\n' + outreach.bluesky.text);
    console.log('\nCover file: outreach/weekly-cover.png');
  }

  if (channel === 'discord' || channel === 'all') {
    console.log('\n[2] Posting Discord forum + announce…');
    const threadUrl = await postDiscord(game);
    const outreach = buildOutreach(game, threadUrl);
    writePackage(outreach);
  }

  if (channel === 'bluesky' || channel === 'all') {
    console.log('\n[3] Posting Bluesky…');
    // Ensure package exists first
    if (!fs.existsSync(path.join(repoRoot(), 'outreach', 'bluesky.json'))) {
      buildWeeklyCover(game);
      writePackage(buildOutreach(game, CLUB_URL));
    }
    await postBluesky();
  }

  if (channel === 'reddit') {
    console.log('\nReddit is manual:');
    console.log('1. Open https://www.reddit.com/r/PakGameDev/submit?type=IMAGE');
    console.log('2. Click Greasemonkey "Weekly Game Post"');
    console.log('3. Confirm title/body/cover, then submit');
  }

  console.log('\nDone.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
