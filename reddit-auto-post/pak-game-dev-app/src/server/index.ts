import express from 'express';
import { createServer, getServerPort, context, reddit, scheduler } from '@devvit/web/server';
import type { Response } from 'express';
import type { UIResponse } from '@devvit/web/shared';

const app = express();
app.use(express.json());

const router = express.Router();

// This endpoint is invoked by the scheduler according to the cron config
router.post('/internal/scheduler/weekly-game', async (_req, res) => {
  try {
    const { subredditName } = context;
    if (!subredditName) {
      res.status(400).json({ status: 'error', message: 'subredditName is required' });
      return;
    }

    // Replace with your actual raw GitHub URL
    const response = await fetch(
      'https://pakgamedev.com/gameclubactions/reddit-auto-post/post.json'
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as { title: string; body: string };

    if (!data.title || !data.body) {
      throw new Error('JSON must contain "title" and "body" fields');
    }

    await reddit.submitCustomPost({
      subredditName,
      title: data.title,
      entry: 'default',
      userGeneratedContent: {
        text: data.body,
      },
    });

    res.status(200).json({ status: 'ok', message: 'Post submitted from GitHub JSON' });
  } catch (error) {
    console.error('Scheduler GitHub post error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to create post' });
  }
});

// Menu endpoint to trigger the scheduled task manually
router.post(
  '/internal/menu/weekly-game',
  async (_req, res: Response<UIResponse>) => {
    try {
      const runAt = new Date(); // run immediately

      await scheduler.runJob({
        id: `manual-github-post-${Date.now()}`,
        name: 'weekly-game', // must match the task name in devvit.json
        data: {},
        runAt,
      });

      res.json({
        showToast: {
          text: 'Scheduled GitHub post task to run now',
          appearance: 'success',
        },
      });
    } catch (error) {
      console.error('Error scheduling manual GitHub task:', error);
      res.json({
        showToast: {
          text: 'Failed to schedule task',
          appearance: 'neutral',
        },
      });
    }
  }
);


export async function createPost() {
  const { subredditName } = context;
  if (!subredditName) throw new Error('subredditName is required');

  await reddit.submitCustomPost({
    subredditName,
    title: 'Welcome To Pak Game Dev!',
    entry: 'default', // must match devvit.json post.entrypoints key
    postData: {},
  });
}

// Menu endpoint to trigger the scheduled task manually
router.post(
  '/internal/menu/create-post',
  async (_req, res: Response<UIResponse>) => {
    createPost();
  }
);

app.use(router);

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(getServerPort());