# prisma/schema.prisma の内容をデータベースに反映(本番DBの接続情報が使えるのはコンテナ起動時のため、ここはランタイムに残す)
npx prisma db push

# アプリケーションを起動
node src/server.js