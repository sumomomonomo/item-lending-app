const { html } = require('hono/html');

function layout(c, title, body) {
  const { user } = c.get('session') ?? {};
  title = title ? `${title} - 部活動備品貸出くん` : '部活動備品貸出くん';
  return html`
    <!doctype html>
    <html>
      <head>
        <title>${title}</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/stylesheets/bundle.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css">
      </head>
      <body>
        <nav class="navbar navbar-expand-md navbar-dark bg-primary" style="--bs-navbar-color: rgba(255,255,255,.85); --bs-navbar-hover-color: #fff; --bs-navbar-active-color: #fff;">
          <div class="container-fluid">
            <a class="navbar-brand" href="/">部活動備品貸出くん</a>
            <button
              class="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#navbarResponsive"
              aria-controls="navbarResponsive"
              aria-expanded="false"
              aria-label="Toggle navigation"
            >
              <span class="navbar-toggler-icon"></span>
            </button>
            <div id="navbarResponsive" class="collapse navbar-collapse">
              <ul class="navbar-nav ms-auto">
                ${user
                  ? html`
                      <li class="nav-item">
                        <a class="nav-link fw-semibold" href="/">備品一覧</a>
                      </li>
                      <li class="nav-item">
                        <a class="nav-link fw-semibold" href="/mypage">マイページ</a>
                      </li>
                      <li class="nav-item">
                        <a class="nav-link fw-semibold" href="/logout"
                          >${user.login} をログアウト</a
                        >
                      </li>
                    `
                  : html`
                      <li class="nav-item">
                        <a class="nav-link fw-semibold" href="/login">ログイン</a>
                      </li>
                    `}
              </ul>
            </div>
          </div>
        </nav>
        <div class="container">${body}</div>
        <script src="/javascripts/bundle.js"></script>
      </body>
    </html>
  `;
}

module.exports = layout;