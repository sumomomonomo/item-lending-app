const { Hono } = require('hono');
const { html } = require('hono/html');
const layout = require('../layout');
const ensureAuthenticated = require('../middlewares/ensure-authenticated');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['query'] });

const app = new Hono();

app.use(ensureAuthenticated());

app.get('/', async (c) => {
  const { user } = c.get('session') ?? {};

  const myReservations = await prisma.reservation.findMany({
    where: { userId: parseInt(user.id, 10), quantity: { gt: 0 } },
    include: { item: true },
    orderBy: { borrowedAt: 'desc' },
  });

  return c.html(
    layout(
      c,
      'マイページ',
      html`
        <h3 class="my-3">現在借りているもの</h3>
        ${myReservations.length === 0
          ? html`<p>現在借りている備品はありません。</p>`
          : html`
              <ul class="list-group">
                ${myReservations.map(
                  (r) => html`
                    <li
                      class="list-group-item d-flex justify-content-between align-items-center"
                    >
                      <a href="/items/${r.item.itemId}">
                        ${r.item.itemName}(${r.quantity} 個)
                      </a>
                      <a href="/items/${r.item.itemId}" class="btn btn-sm btn-danger">
                        詳細で返却する
                      </a>
                    </li>
                  `,
                )}
              </ul>
            `}
      `,
    ),
  );
});

module.exports = app;