/**
 * Monday job: pick highest-voted queued game, post Discord, write outreach package.
 * Env: APP_ID, DISCORD_BOT_TOKEN, DISCORD_FORUM_CHANNEL_ID,
 *      DEV_CLUB_ROLE_ID, DISCORD_ANNOUNCE_CHANNEL_ID
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const admin = require('firebase-admin');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

admin.initializeApp();
const db = admin.firestore();

const CLUB_URL = 'https://pakgamedev.com/club';
const DISCORD_INVITE = 'https://pakgamedev.com/discord';
const COVER_URL =
  'https://pakgamedev.com/gameclubactions/outreach/weekly-cover.png';
const ACTIVE_TAG = '1455828972339331146';

const {
  APP_ID,
  DISCORD_BOT_TOKEN,
  DISCORD_FORUM_CHANNEL_ID,
  DEV_CLUB_ROLE_ID,
  DISCORD_ANNOUNCE_CHANNEL_ID,
} = process.env;

function repoRoot() {
  return path.join(__dirname, '..');
}

function pickTopVoted(docs) {
  let bestVotes = -1;
  const tied = [];
  for (const doc of docs) {
    const votes = Number(doc.data().votes) || 0;
    if (votes > bestVotes) {
      bestVotes = votes;
      tied.length = 0;
      tied.push(doc);
    } else if (votes === bestVotes) {
      tied.push(doc);
    }
  }
  return tied[Math.floor(Math.random() * tied.length)];
}

function buildOutreach(game, threadUrl) {
  const deadlineNote =
    'Everyone has until Sunday 11pm PKT to play, review, and discuss.';
  const kingLine =
    'As Stephen King says "If you want to be a writer, you must do two things above all others: read a lot and write a lot." We aim to play a lot of games and make a lot of games.';
  const weeklyHook =
    "Every week we'll play one game, take notes, analyze it as a developer, and discuss on Discord.";

  // Reddit + LinkedIn (same body)
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

  const youtubeBlurb = [
    weeklyHook,
    kingLine,
    `This week we are playing ${game.name}.`,
    deadlineNote,
    `Discuss: ${threadUrl}`,
    `More: ${CLUB_URL}`,
  ].join('\n');

  // Bluesky hard-caps at 300 graphemes; full copy with Discord thread URL usually overflows.
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
    linkedin: {
      text: body,
      cover_image: COVER_URL,
      club_url: CLUB_URL,
      discord_thread_url: threadUrl,
      game_name: game.name,
    },
    weeklyMd: [
      `# Weekly Game Dev Club: ${game.name}`,
      '',
      '## Assets',
      `- Cover (IG / TikTok / Reddit / LinkedIn / YouTube): ${COVER_URL}`,
      `- Raw header: ${game.header_image || ''}`,
      '',
      '## Links',
      `- Game: ${game.url || ''}`,
      `- Club board: ${CLUB_URL}`,
      `- Discord thread: ${threadUrl}`,
      `- Discord invite: ${DISCORD_INVITE}`,
      '',
      '## Reddit (manual via Greasemonkey)',
      '1. Open https://www.reddit.com/r/PakGameDev/submit?type=IMAGE',
      '2. Click the floating **Weekly Game Post** userscript button (fills title/body/cover).',
      '3. Review and submit.',
      '',
      '## Short caption (Instagram / TikTok)',
      '```',
      shortCaption,
      '```',
      '',
      '## LinkedIn (auto when secrets set; paste fallback)',
      '```',
      body,
      '```',
      '',
      '## YouTube community / description (+ weekly cover)',
      '```',
      youtubeBlurb,
      '```',
      '',
      '## Bluesky (auto)',
      '```',
      blueskyText,
      '```',
      '',
    ].join('\n'),
  };
}

function buildWeeklyCover(game) {
  const script = path.join(repoRoot(), 'scripts', 'build_weekly_cover.py');
  const outDir = path.join(repoRoot(), 'outreach');
  const args = [script, '--name', game.name || 'Weekly Game', '--out-dir', outDir];
  if (game.header_image) {
    args.push('--image-url', game.header_image);
  }
  const result = spawnSync('python3', args, { encoding: 'utf8' });
  if (result.stdout) console.log(result.stdout.trim());
  if (result.status !== 0) {
    console.error(result.stderr || 'cover build failed');
    throw new Error(`build_weekly_cover.py exited ${result.status}`);
  }
}

async function writeOutreachFiles(outreach) {
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
  fs.writeFileSync(
    path.join(outreachDir, 'linkedin.json'),
    JSON.stringify(outreach.linkedin, null, 2) + '\n'
  );
  fs.writeFileSync(path.join(outreachDir, 'weekly.md'), outreach.weeklyMd);
}

async function run() {
  const gamesColPath = `artifacts/${APP_ID}/public/data/games`;
  const currentDocPath = `artifacts/${APP_ID}/public/data/current/game`;

  const snapshot = await db.collection(gamesColPath).get();
  if (snapshot.empty) {
    console.log('No games found');
    return;
  }

  const selectedDoc = pickTopVoted(snapshot.docs);
  const game = selectedDoc.data();
  const voteCount = Number(game.votes) || 0;
  console.log(`Selected ${game.name} with ${voteCount} vote(s)`);

  // Delete vote subcollection docs before removing the queue doc
  const votesSnap = await selectedDoc.ref.collection('votes').get();
  const batch = db.batch();
  votesSnap.docs.forEach((v) => batch.delete(v.ref));
  batch.delete(selectedDoc.ref);
  await batch.commit();

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(DISCORD_BOT_TOKEN);

  await new Promise((resolve, reject) => {
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
          .setFooter({ text: 'Weekly Game' })
          .setTimestamp();

        if (game.icon_image) {
          embed.setThumbnail(game.icon_image);
        }

        const thread = await channel.threads.create({
          name: game.name,
          appliedTags: [ACTIVE_TAG],
          message: {
            content: [
              `<@&${DEV_CLUB_ROLE_ID}> Download the game, play it and take notes.`,
              'Pay attention to what the game is trying to do? What do you like about it? What you don\'t like? and really dig deep into why?',
              `Deadline: <t:${unixTimestamp}:f>`,
              `Pick the next game: ${CLUB_URL}`,
            ].join('\n'),
            embeds: [embed],
          },
        });

        const threadUrl = `https://discord.com/channels/${thread.guildId}/${thread.id}`;
        const forumChannelLink = `https://discord.com/channels/${thread.guildId}/${DISCORD_FORUM_CHANNEL_ID}`;

        await db.doc(currentDocPath).set({
          ...game,
          votes: voteCount,
          discord_thread_id: thread.id,
          discord_thread_url: threadUrl,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        const announceChannel = await client.channels.fetch(
          DISCORD_ANNOUNCE_CHANNEL_ID
        );
        await announceChannel.send(
          `Check out the latest game in ${forumChannelLink} : ${threadUrl}\n` +
            `Pick the next game: ${CLUB_URL}`
        );

        fs.writeFileSync(
          path.join(repoRoot(), '.github', 'workflows', 'current_thread_id'),
          thread.id,
          'utf8'
        );

        buildWeeklyCover(game);
        const outreach = buildOutreach(game, threadUrl);
        await writeOutreachFiles(outreach);

        client.destroy();
        resolve();
      } catch (err) {
        client.destroy();
        reject(err);
      }
    });
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
