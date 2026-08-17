const { Hono } = require('hono');
const { html } = require('hono/html');
const layout = require('../layout');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['query'] });

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Tokyo');

const app = new Hono();

function itemTable(items) {
  return html`
    <table class="table">
      <tr>
        <th>備品名</th>
        <th>在庫状況</th>
        <th>更新日時</th>
      </tr>
      ${items.map((item) => {
        const isFull = item.borrowedTotal >= item.totalStock;
        return html`
          <tr>
            <td>
              <a href="/items/${item.itemId}">${item.itemName}</a>
            </td>
            <td>
              <span class="badge ${isFull ? 'bg-danger' : 'bg-success'}">
                ${item.borrowedTotal} / ${item.totalStock} 貸出中
              </span>
            </td>
            <td>${item.formattedUpdatedAt}</td>
          </tr>
        `;
      })}
    </table>
  `;
}

app.get('/', async (c) => {
  const { user } = c.get('session') ?? {};

  // 全備品を一覧表示(予定調整くんと違い、部員全員が全備品を見られる必要があるため)
  const items = user
    ? await prisma.item.findMany({
        orderBy: { itemName: 'asc' },
        include: {
          reservations: {
            where: { quantity: { gt: 0 } },
          },
        },
      })
    : [];
  items.forEach((item) => {
    item.borrowedTotal = item.reservations.reduce(
      (sum, r) => sum + r.quantity,
      0,
    );
    item.formattedUpdatedAt = dayjs(item.updatedAt).tz().format('YYYY/MM/DD HH:mm');
  });

  return c.html(
    layout(
      c,
      null,
      html`
        <div class="my-3">
          <div class="p-5 bg-light rounded-3">
            <h1 class="text-body">部活動備品貸出くん</h1>
            <p class="lead">
              部活動備品貸出くんは、GitHubで認証でき、部の備品の貸出・返却を管理できるサービスです。
            </p>
          </div>
        </div>
        ${user
          ? html`
              <div class="my-3">
                <h3 class="my-3">備品を登録する</h3>
                <a class="btn btn-primary" href="/items/new">備品を登録する</a>
                ${items.length > 0
                  ? html`
                      <h3 class="my-3">備品一覧</h3>
                      ${itemTable(items)}
                    `
                  : ''}
              </div>
            `
          : ''}
      `,
    ),
  );
});

module.exports = app;