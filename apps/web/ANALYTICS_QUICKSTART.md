# Analytics Quick Start

## ✅ Что реализовано

Минимальная backend аналитика для ответа на 3 вопроса каждый день:

1. **Сколько новых пользователей?** → `newUsers`
2. **Сколько из них играли/доиграли?** → `newUsersPlayedAtLeastOne`, `newUsersFinishedAtLeastOne`
3. **На какой партии отваливаются?** → `duelDropoff`

## 🚀 Как использовать

### Сегодняшние метрики

```bash
curl https://your-app.com/api/admin/daily-metrics
```

**Ответ:**
```json
{
  "success": true,
  "metrics": {
    "date": "2026-01-18",
    "newUsers": 42,
    "newUsersPlayedAtLeastOne": 35,
    "newUsersFinishedAtLeastOne": 28,
    "duelDropoff": {
      "1": 150,
      "2": 120,
      "3": 80,
      "4": 45,
      "5": 20
    }
  }
}
```

### Конкретный день

```bash
curl "https://your-app.com/api/admin/daily-metrics?date=2026-01-17"
```

### Диапазон дат

```bash
curl "https://your-app.com/api/admin/daily-metrics?startDate=2026-01-15&endDate=2026-01-18"
```

## 📊 Интерпретация

### Воронка активации

```
42 новых пользователей
  ↓ 83% conversion (35/42)
35 сыграли >= 1 дуэль
  ↓ 80% completion (28/35)
28 доиграли >= 1 дуэль
```

**Вопросы:**
- Почему 7 пользователей не начали играть? → Улучшить онбординг
- Почему 7 не дошли до конца? → Проверить UX, сложность

### Drop-off анализ

```json
{
  "1": 150,  // 150 играли >= 1 дуэль
  "2": 120,  // 120 играли >= 2 дуэли → 30 ушли после 1-й
  "3": 80,   // 80 играли >= 3 дуэли → 40 ушли после 2-й
  "4": 45,   // 45 играли >= 4 дуэли → 35 ушли после 3-й (!)
  "5": 20    // 20 играли >= 5 дуэлей → 25 ушли после 4-й
}
```

**Drop-off rate:**
- После 1-й: `(150-120)/150 = 20%`
- После 2-й: `(120-80)/120 = 33%`
- После 3-й: `(80-45)/80 = 44%` ← **МАКСИМАЛЬНЫЙ отвал**
- После 4-й: `(45-20)/45 = 56%`

**Инсайт:** Большинство бросают после 3-й дуэли → проверить:
- Награды недостаточны?
- Слишком долго?
- Нет прогрессии?

## 🔧 Деплой

### 1. Миграция БД (автоматическая)

Vercel применит миграцию автоматически при деплое.

### 2. Миграция БД (ручная, если нужно)

Если автомиграция не прошла:

```bash
cd apps/web
psql $DATABASE_URL < MIGRATION_ANALYTICS.sql
```

### 3. Проверка

```bash
# После первого дуэля проверь:
psql $DATABASE_URL -c "SELECT * FROM \"UserDailyDuelCounter\" LIMIT 5;"

# Проверь API:
curl https://your-app.com/api/admin/daily-metrics
```

## 📁 Файлы

| Файл | Назначение |
|------|------------|
| `src/lib/analytics.ts` | Сервисные функции |
| `src/app/api/admin/daily-metrics/route.ts` | API endpoint |
| `src/app/api/duel/[id]/finish/route.ts` | Интеграция (increment) |
| `prisma/schema.prisma` | Схема БД |
| `ANALYTICS.md` | Полная документация |
| `MIGRATION_ANALYTICS.sql` | Ручная миграция |

## 🛡️ Безопасность

**Текущий статус:** Endpoint открыт (без auth)

**Для production добавь:**

```typescript
// В route.ts
const adminSecret = process.env.ADMIN_SECRET;
const provided = request.headers.get('X-Admin-Secret');

if (provided !== adminSecret) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

**Использование:**
```bash
curl -H "X-Admin-Secret: your-secret-here" \
  https://your-app.com/api/admin/daily-metrics
```

## 🔍 Мониторинг

### Проверка здоровья

```sql
-- Последние 7 дней
SELECT date, COUNT(*), SUM("duelsPlayed") 
FROM "UserDailyDuelCounter" 
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY date
ORDER BY date DESC;
```

### Логи

Смотри в Vercel Logs:
```
[Analytics] Incremented duel counter for user abc123 on 2026-01-18
[Analytics] Failed to increment: <error>
```

## 🎯 Критерии готовности

✅ Один endpoint для всех метрик  
✅ Нет client-side событий  
✅ Нет внешних аналитик  
✅ Минимальные изменения в схеме  
✅ Легко расширить  

## 📈 Что дальше?

### Легко добавить:

1. **Retention (Day 7):** Сколько вернулись через неделю
2. **Churn:** Кто не играл 7+ дней
3. **Peak hours:** В какое время больше всего играют
4. **Topic popularity:** Какие темы выбирают
5. **Win rate:** % побед новых пользователей

Все расширения в `ANALYTICS.md` → раздел "Future Extensions".

## 🐛 Troubleshooting

### Счетчик не растет

**Проверь логи:** `[Analytics] Failed to increment`

**Причины:**
1. DB connection issue
2. Missing userId
3. Duel не в статусе 'finished'

### Метрики показывают 0

**Проверь:**
1. Прошло ли время с последней дуэли? (счетчик обновляется при finish)
2. Таймзона корректна? (используй UTC)
3. Дата правильная? (формат YYYY-MM-DD)

**Ручной запрос:**
```sql
SELECT COUNT(*) FROM "User" 
WHERE "createdAt" >= CURRENT_DATE 
AND "createdAt" < CURRENT_DATE + INTERVAL '1 day';
```

## 💡 Примеры использования

### Dashboard в Google Sheets

1. Каждый день запрашивай метрики через Apps Script
2. Записывай в лист
3. Строй графики

### Slack webhook

```javascript
// Каждое утро отправляй метрики в Slack
const metrics = await fetch('/api/admin/daily-metrics').then(r => r.json());
await fetch(SLACK_WEBHOOK, {
  method: 'POST',
  body: JSON.stringify({
    text: `📊 Метрики за вчера:
- Новых пользователей: ${metrics.newUsers}
- Сыграли: ${metrics.newUsersPlayedAtLeastOne}
- Дошли до конца: ${metrics.newUsersFinishedAtLeastOne}
- Drop-off после 3-й: ${((metrics.duelDropoff[3] - metrics.duelDropoff[4]) / metrics.duelDropoff[3] * 100).toFixed(0)}%`
  })
});
```

### Telegram bot

```javascript
// Бот команда /metrics
bot.command('metrics', async (ctx) => {
  const metrics = await fetch('/api/admin/daily-metrics').then(r => r.json());
  ctx.reply(`📈 Сегодня:
Новых: ${metrics.newUsers}
Играли: ${metrics.newUsersPlayedAtLeastOne}
Доиграли: ${metrics.newUsersFinishedAtLeastOne}`);
});
```

---

**Вопросы?** См. полную документацию в `ANALYTICS.md`
