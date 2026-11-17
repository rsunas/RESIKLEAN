/** Bound optional native/network work without leaving timers behind. */
export async function withTimeout<T>(operation: Promise<T>, milliseconds = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Operation timed out. Please try again.')), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
