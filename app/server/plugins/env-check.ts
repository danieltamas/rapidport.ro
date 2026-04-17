import '../utils/env';

export default defineNitroPlugin(() => {
  // env import above triggered validation at module load — if we reach here, all required vars are present
});
