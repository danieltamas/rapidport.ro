import { stopQueue } from '../utils/queue';

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('close', async () => {
    await stopQueue();
  });
});
