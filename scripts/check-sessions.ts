import 'dotenv/config';
import { db, pool } from '@/db';
import { users, sessions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

async function check() {
  const [u] = await db.select().from(users).where(eq(users.email, 'charlotteesthy49@gmail.com'));
  if (!u) {
    console.log('User not found');
    return;
  }
  const sess = await db.select().from(sessions).where(eq(sessions.userId, u.id)).orderBy(desc(sessions.createdAt)).limit(5);
  console.log('User ID:', u.id);
  console.log('Recent sessions count:', sess.length);
  sess.forEach(s => console.log('Session ID:', s.id, 'Created:', s.createdAt, 'Expires:', s.expiresAt));
}

check()
  .catch(console.error)
  .finally(() => pool.end());

