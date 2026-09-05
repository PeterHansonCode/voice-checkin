export async function retrySave(operation, onRetry = () => {}, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await operation(); }
    catch (error) {
      if ((error.status && error.status < 500) || attempt === 2) throw error;
      onRetry(attempt + 2);
      await sleep(400 * 2 ** attempt);
    }
  }
}
