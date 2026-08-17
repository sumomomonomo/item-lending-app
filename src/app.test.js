'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['query'] });

const testUser = {
  userId: 0,
  username: 'testuser',
};

function mockIronSession() {
  const ironSession = require('iron-session');
  jest.spyOn(ironSession, 'getIronSession').mockReturnValue({
    user: { login: testUser.username, id: testUser.userId },
    save: jest.fn(),
    destroy: jest.fn(),
  });
}

// テストで作成したデータを削除
async function deleteItemAggregate(itemId) {
  const { deleteItemAggregate } = require('./routes/items');
  await deleteItemAggregate(itemId);
}

// フォームからリクエストを送信する
async function sendFormRequest(app, path, body) {
  return app.request(path, {
    method: 'POST',
    body: new URLSearchParams(body),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'http://localhost:3000',
    },
  });
}

describe('/login', () => {
  beforeAll(() => {
    mockIronSession();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('ログインのためのリンクが含まれる', async () => {
    const app = require('./app');
    const res = await app.request('/login');
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=UTF-8');
    expect(await res.text()).toMatch(/<a href="\/auth\/github"/);
    expect(res.status).toBe(200);
  });

  test('ログイン時はユーザ名が表示される', async () => {
    const app = require('./app');
    const res = await app.request('/login');
    expect(await res.text()).toMatch(/testuser/);
    expect(res.status).toBe(200);
  });
});

describe('/logout', () => {
  test('ログアウト時に / へリダイレクトされる', async () => {
    const app = require('./app');
    const res = await app.request('/logout');
    expect(res.headers.get('Location')).toBe('/');
    expect(res.status).toBe(302);
  });
});

describe('/items', () => {
  let itemId = '';
  beforeAll(() => {
    mockIronSession();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await deleteItemAggregate(itemId);
  });

  test('備品が登録でき、表示される', async () => {
    await prisma.user.upsert({
      where: { userId: testUser.userId },
      create: testUser,
      update: testUser,
    });

    const app = require('./app');

    const postRes = await sendFormRequest(app, '/items', {
      itemName: 'テスト三脚',
      memo: 'テストメモ1',
      totalStock: '3',
    });

    const createdItemPath = postRes.headers.get('Location');
    expect(createdItemPath).toMatch(/items/);
    expect(postRes.status).toBe(302);

    itemId = createdItemPath.split('/items/')[1];

    const res = await app.request(createdItemPath);
    const body = await res.text();
    expect(body).toMatch(/テスト三脚/);
    expect(body).toMatch(/テストメモ1/);
    expect(body).toMatch(/0 \/ 3 貸出中/);
    expect(res.status).toBe(200);
  });
});

describe('/items/:itemId/borrow, /items/:itemId/return', () => {
  let itemId = '';
  beforeAll(() => {
    mockIronSession();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await deleteItemAggregate(itemId);
  });

  test('指定した数だけ借りられ、在庫に反映される', async () => {
    await prisma.user.upsert({
      where: { userId: testUser.userId },
      create: testUser,
      update: testUser,
    });

    const app = require('./app');

    const postRes = await sendFormRequest(app, '/items', {
      itemName: 'テスト貸出備品1',
      memo: 'テスト貸出メモ1',
      totalStock: '5',
    });
    itemId = postRes.headers.get('Location').split('/items/')[1];

    const borrowRes = await sendFormRequest(app, `/items/${itemId}/borrow`, {
      quantity: '2',
    });
    expect(borrowRes.status).toBe(302);

    const reservation = await prisma.reservation.findUnique({
      where: {
        reservationCompositeId: { itemId, userId: testUser.userId },
      },
    });
    expect(reservation.quantity).toBe(2);
  });

  test('在庫数を超える貸出はエラーになる', async () => {
    const app = require('./app');

    const res = await sendFormRequest(app, `/items/${itemId}/borrow`, {
      quantity: '10',
    });
    expect(res.status).toBe(302);

    const location = res.headers.get('Location');
    expect(location).toMatch(`/items/${itemId}?error=`);
    expect(decodeURIComponent(location)).toMatch(/在庫が足りません/);

    const reservation = await prisma.reservation.findUnique({
      where: {
        reservationCompositeId: { itemId, userId: testUser.userId },
      },
    });
    // 直前のテストで借りた2個のまま変わっていないこと
    expect(reservation.quantity).toBe(2);
  });

  test('一部だけ返却でき、残りの数が正しく反映される', async () => {
    const app = require('./app');

    const returnRes = await sendFormRequest(app, `/items/${itemId}/return`, {
      quantity: '1',
    });
    expect(returnRes.status).toBe(302);

    const reservation = await prisma.reservation.findUnique({
      where: {
        reservationCompositeId: { itemId, userId: testUser.userId },
      },
    });
    expect(reservation.quantity).toBe(1);
  });
});

describe('/items/:itemId/update', () => {
  let itemId = '';
  beforeAll(() => {
    mockIronSession();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await deleteItemAggregate(itemId);
  });

  test('作成者は備品名・メモ・在庫総数を更新できる', async () => {
    await prisma.user.upsert({
      where: { userId: testUser.userId },
      create: testUser,
      update: testUser,
    });

    const app = require('./app');

    const postRes = await sendFormRequest(app, '/items', {
      itemName: 'テスト更新備品1',
      memo: 'テスト更新メモ1',
      totalStock: '2',
    });
    itemId = postRes.headers.get('Location').split('/items/')[1];

    await sendFormRequest(app, `/items/${itemId}/update`, {
      itemName: 'テスト更新備品2',
      memo: 'テスト更新メモ2',
      totalStock: '10',
    });

    const item = await prisma.item.findUnique({ where: { itemId } });
    expect(item.itemName).toBe('テスト更新備品2');
    expect(item.memo).toBe('テスト更新メモ2');
    expect(item.totalStock).toBe(10);
  });
});

describe('/items/:itemId/delete', () => {
  beforeAll(() => {
    mockIronSession();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('備品に関連するすべての情報が削除できる', async () => {
    await prisma.user.upsert({
      where: { userId: testUser.userId },
      create: testUser,
      update: testUser,
    });

    const app = require('./app');

    const postRes = await sendFormRequest(app, '/items', {
      itemName: 'テスト削除備品1',
      memo: 'テスト削除メモ1',
      totalStock: '4',
    });
    const itemId = postRes.headers.get('Location').split('/items/')[1];

    // 貸出予約を作成
    await sendFormRequest(app, `/items/${itemId}/borrow`, {
      quantity: '1',
    });

    // 削除
    const res = await sendFormRequest(app, `/items/${itemId}/delete`, {});
    expect(res.status).toBe(302);

    // テスト
    const reservations = await prisma.reservation.findMany({
      where: { itemId },
    });
    expect(reservations.length).toBe(0);

    const item = await prisma.item.findUnique({ where: { itemId } });
    expect(item).toBeNull();
  });
});