const { Hono } = require('hono');
const { html } = require('hono/html');
const layout = require('../layout');
const ensureAuthenticated = require('../middlewares/ensure-authenticated');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['query'] });
const { z } = require('zod');
const { zValidator } = require('@hono/zod-validator');
const { HTTPException } = require('hono/http-exception');

const app = new Hono();

app.use(ensureAuthenticated());

const itemIdValidator = zValidator(
  'param',
  z.object({
    itemId: z.string().uuid(),
  }),
  (result) => {
    if (!result.success) {
      throw new HTTPException(400, { message: 'URL の形式が正しくありません。' });
    }
  }
);

const itemFormValidator = zValidator(
  'form',
  z.object({
    itemName: z.string(),
    memo: z.string(),
    totalStock: z.coerce.number().int().positive(),
  }),
  (result) => {
    if (!result.success) {
      throw new HTTPException(400, { message: '入力された情報が不十分または正しくありません' });
    }
  }
);

const quantityFormValidator = zValidator(
  'form',
  z.object({
    quantity: z.coerce.number().int().positive(),
  }),
  (result) => {
    if (!result.success) {
      throw new HTTPException(400, { message: '数量は1以上の整数で入力してください' });
    }
  }
);

function isMine(userId, item) {
  return item && parseInt(item.createdBy, 10) === parseInt(userId, 10);
}

// 備品の新規登録フォーム
app.get('/new', (c) => {
  return c.html(
    layout(
      c,
      '備品の登録',
      html`
        <form method="post" action="/items" class="my-3">
          <div class="mb-3">
            <label class="form-label">備品名</label>
            <input type="text" name="itemName" class="form-control" />
          </div>
          <div class="mb-3">
            <label class="form-label">メモ</label>
            <textarea name="memo" class="form-control"></textarea>
          </div>
          <div class="mb-3">
            <label class="form-label">在庫総数</label>
            <input type="number" name="totalStock" min="1" class="form-control" />
          </div>
          <button class="btn btn-primary" type="submit">備品を登録する</button>
        </form>
      `,
    ),
  );
});

// 備品の新規登録処理 (誰でも作成可)
app.post('/', itemFormValidator, async (c) => {
  const { user } = c.get('session') ?? {};
  const body = c.req.valid('form');

  const { itemId } = await prisma.item.create({
    data: {
      itemId: randomUUID(),
      itemName: body.itemName.slice(0, 255) || '（名称未設定）',
      memo: body.memo,
      totalStock: body.totalStock,
      createdBy: user.id,
      updatedAt: new Date(),
    },
  });

  return c.redirect('/items/' + itemId);
});

// 備品詳細 (在庫状況・借りる/返すフォーム)
app.get('/:itemId', itemIdValidator, async (c) => {
  const { user } = c.get('session') ?? {};
  const item = await prisma.item.findUnique({
    where: { itemId: c.req.valid('param').itemId },
    include: {
      user: {
        select: {
          userId: true,
          username: true,
        },
      },
    },
  });

  if (!item) {
    return c.notFound();
  }

  // この備品を1個以上借りている人をすべて取得
  const reservations = await prisma.reservation.findMany({
    where: { itemId: item.itemId, quantity: { gt: 0 } },
    include: {
      user: {
        select: {
          userId: true,
          username: true,
        },
      },
    },
  });

  const borrowedTotal = reservations.reduce((sum, r) => sum + r.quantity, 0);
  const myReservation = reservations.find(
    (r) => r.userId === parseInt(user.id, 10),
  );
  const myQuantity = myReservation ? myReservation.quantity : 0;
  const remaining = item.totalStock - borrowedTotal;
  const errorMessage = c.req.query('error');

  return c.html(
    layout(
      c,
      `備品: ${item.itemName}`,
      html`
        ${errorMessage
          ? html`<div class="alert alert-danger my-3">${errorMessage}</div>`
          : ''}
        <div class="card my-3">
          <h4 class="card-header">${item.itemName}</h4>
          <div class="card-body">
            <p style="white-space: pre;">${item.memo}</p>
            <p>在庫: ${borrowedTotal} / ${item.totalStock} 貸出中(残り ${remaining})</p>
            ${myQuantity > 0
              ? html`<p>あなたは現在 ${myQuantity} 個借りています。</p>`
              : ''}
          </div>
          <div class="card-footer">登録者: ${item.user.username}</div>
        </div>

        ${isMine(user.id, item)
          ? html`
              <a href="/items/${item.itemId}/edit" class="btn btn-primary">
                この備品を編集する <i class="bi bi-pencil"></i>
              </a>
            `
          : ''}

        <div class="my-3 row g-2">
          <div class="col-auto">
            ${remaining > 0
              ? html`
                  <form method="post" action="/items/${item.itemId}/borrow" class="d-flex gap-2">
                    <input
                      type="number"
                      name="quantity"
                      min="1"
                      max="${remaining}"
                      value="1"
                      class="form-control"
                      style="width: 6rem;"
                    />
                    <button type="submit" class="btn btn-success">借りる</button>
                  </form>
                `
              : html`
                  <button type="button" class="btn btn-danger" disabled>
                    貸出中のため予約不可
                  </button>
                `}
          </div>
          ${myQuantity > 0
            ? html`
                <div class="col-auto">
                  <form method="post" action="/items/${item.itemId}/return" class="d-flex gap-2">
                    <input
                      type="number"
                      name="quantity"
                      min="1"
                      max="${myQuantity}"
                      value="${myQuantity}"
                      class="form-control"
                      style="width: 6rem;"
                    />
                    <button type="submit" class="btn btn-secondary">返す</button>
                  </form>
                </div>
              `
            : ''}
        </div>

        <h3 class="my-3">現在借りている人</h3>
        ${reservations.length === 0
          ? html`<p class="text-muted">現在借りている人はいません。</p>`
          : html`
              <ul class="list-group">
                ${reservations.map(
                  (r) => html`
                    <li class="list-group-item">
                      ${r.user.username}: ${r.quantity} 個
                    </li>
                  `,
                )}
              </ul>
            `}
      `,
    ),
  );
});

// 「借りる」処理 (誰でも可、在庫チェックあり、指定数を加算)
app.post('/:itemId/borrow', itemIdValidator, quantityFormValidator, async (c) => {
  const { user } = c.get('session') ?? {};
  const itemId = c.req.valid('param').itemId;
  const { quantity } = c.req.valid('form');
  const userId = parseInt(user.id, 10);

  const item = await prisma.item.findUnique({ where: { itemId } });
  if (!item) {
    return c.notFound();
  }

  const borrowedTotal = await prisma.reservation.aggregate({
    where: { itemId },
    _sum: { quantity: true },
  });
  const currentTotal = borrowedTotal._sum.quantity ?? 0;

  if (currentTotal + quantity > item.totalStock) {
    const message = encodeURIComponent(
      `在庫が足りません(残り ${item.totalStock - currentTotal} 個)`,
    );
    return c.redirect(`/items/${itemId}?error=${message}`);
  }

  const existing = await prisma.reservation.findUnique({
    where: { reservationCompositeId: { itemId, userId } },
  });

  await prisma.reservation.upsert({
    where: { reservationCompositeId: { itemId, userId } },
    update: {
      quantity: (existing?.quantity ?? 0) + quantity,
      borrowedAt: new Date(),
    },
    create: {
      itemId,
      userId,
      quantity,
      borrowedAt: new Date(),
    },
  });

  return c.redirect('/items/' + itemId);
});

// 「返す」処理 (指定数だけ減算、0になったらborrowedAtをnullに)
app.post('/:itemId/return', itemIdValidator, quantityFormValidator, async (c) => {
  const { user } = c.get('session') ?? {};
  const itemId = c.req.valid('param').itemId;
  const { quantity } = c.req.valid('form');
  const userId = parseInt(user.id, 10);

  const existing = await prisma.reservation.findUnique({
    where: { reservationCompositeId: { itemId, userId } },
  });

  if (!existing || existing.quantity <= 0) {
    const message = encodeURIComponent('返却できる貸出がありません');
    return c.redirect(`/items/${itemId}?error=${message}`);
  }

  const newQuantity = Math.max(existing.quantity - quantity, 0);

  await prisma.reservation.update({
    where: { reservationCompositeId: { itemId, userId } },
    data: {
      quantity: newQuantity,
      borrowedAt: newQuantity === 0 ? null : existing.borrowedAt,
    },
  });

  return c.redirect('/items/' + itemId);
});

// 編集フォーム (作成者のみ)
app.get('/:itemId/edit', itemIdValidator, async (c) => {
  const { user } = c.get('session') ?? {};
  const item = await prisma.item.findUnique({
    where: { itemId: c.req.valid('param').itemId },
  });
  if (!isMine(user.id, item)) {
    return c.notFound();
  }

  return c.html(
    layout(
      c,
      `備品の編集: ${item.itemName}`,
      html`
        <form class="my-3" method="post" action="/items/${item.itemId}/update">
          <div class="mb-3">
            <label class="form-label">備品名</label>
            <input
              type="text"
              name="itemName"
              class="form-control"
              value="${item.itemName}"
            />
          </div>
          <div class="mb-3">
            <label class="form-label">メモ</label>
            <textarea name="memo" class="form-control">${item.memo}</textarea>
          </div>
          <div class="mb-3">
            <label class="form-label">在庫総数</label>
            <input
              type="number"
              name="totalStock"
              min="1"
              class="form-control"
              value="${item.totalStock}"
            />
          </div>
          <button type="submit" class="btn btn-primary">
            以上の内容で備品を編集する <i class="bi bi-pencil"></i>
          </button>
        </form>
        <h3 class="my-3">危険な変更</h3>
        <form method="post" action="/items/${item.itemId}/delete">
          <button type="submit" class="btn btn-danger">
            この備品を削除する <i class="bi bi-trash"></i>
          </button>
        </form>
      `,
    ),
  );
});

// 更新処理 (作成者のみ、最大在庫数もここで変更可能)
app.post('/:itemId/update', itemIdValidator, itemFormValidator, async (c) => {
  const { user } = c.get('session') ?? {};
  const item = await prisma.item.findUnique({
    where: { itemId: c.req.valid('param').itemId },
  });
  if (!isMine(user.id, item)) {
    return c.notFound();
  }

  const body = c.req.valid('form');
  const updatedItem = await prisma.item.update({
    where: { itemId: item.itemId },
    data: {
      itemName: body.itemName.slice(0, 255) || '（名称未設定）',
      memo: body.memo,
      totalStock: body.totalStock,
      updatedAt: new Date(),
    },
  });

  return c.redirect('/items/' + updatedItem.itemId);
});

async function deleteItemAggregate(itemId) {
  await prisma.reservation.deleteMany({ where: { itemId } });
  await prisma.item.delete({ where: { itemId } });
}
app.deleteItemAggregate = deleteItemAggregate;

// 削除処理 (作成者のみ)
app.post('/:itemId/delete', itemIdValidator, async (c) => {
  const { user } = c.get('session') ?? {};
  const item = await prisma.item.findUnique({
    where: { itemId: c.req.valid('param').itemId },
  });
  if (!isMine(user.id, item)) {
    return c.notFound();
  }

  await deleteItemAggregate(item.itemId);
  return c.redirect('/');
});

module.exports = app;