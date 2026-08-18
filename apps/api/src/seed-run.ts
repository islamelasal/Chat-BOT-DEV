/** تشغيل البذرة يدوياً: pnpm seed */
import { migrate } from '@cbd/db';
import { seedDemo } from '@cbd/db/seed';

async function main() {
  await migrate();
  const res = await seedDemo();
  console.log(res.seeded ? 'تم إنشاء بيانات العرض ✅' : 'البيانات موجودة بالفعل — تم التخطي.');
}
void main();
