# Webページ形態素解析ツール

Node.jsとkuromoji.jsを使用したWebページの日本語形態素解析サービスです。

## 機能

- URLを入力するだけでWebページの内容を自動取得
- 日本語テキストの形態素解析
- 品詞ごとの統計情報
- 頻出単語の抽出とランキング表示
- わかりやすいWebインターフェース

## 必要な環境

- Node.js (v14以上推奨)
- npm

## インストール方法

1. 依存パッケージのインストール:
```bash
npm install
```

## 起動方法

```bash
npm start
```

サーバーが起動したら、ブラウザで以下のURLにアクセス:
```
http://localhost:3000
```

## 使い方

1. ブラウザでアプリを開く
2. URL入力欄に解析したいWebページのURLを入力
3. 「解析開始」ボタンをクリック
4. 解析結果が表示されます

## 技術スタック

### バックエンド
- **Express**: Webサーバーフレームワーク
- **kuromoji.js**: 日本語形態素解析エンジン
- **axios**: HTTPクライアント
- **cheerio**: HTMLパーサー（スクレイピング用）

### フロントエンド
- バニラJavaScript
- HTML5/CSS3

## API仕様

### POST `/api/analyze`

**リクエスト:**
```json
{
  "url": "https://example.com"
}
```

**レスポンス:**
```json
{
  "url": "https://example.com",
  "title": "ページタイトル",
  "textLength": 1234,
  "tokenCount": 567,
  "tokens": [
    {
      "surface": "形態素",
      "pos": "名詞",
      "posDetail1": "一般",
      "posDetail2": "*",
      "posDetail3": "*",
      "baseForm": "形態素",
      "reading": "ケイタイソ",
      "pronunciation": "ケータイソ"
    }
  ],
  "summary": {
    "posCount": {
      "名詞": 123,
      "動詞": 45
    },
    "topWords": [
      {
        "word": "解析",
        "count": 10
      }
    ]
  }
}
```

## 制限事項

- テキストは最大5000文字まで解析
- 形態素の表示は最初の100件まで
- JavaScriptで動的に生成されるコンテンツには対応していません
- 一部のWebサイトではアクセス制限により取得できない場合があります

## カスタマイズ

### テキスト抽出の改善
`server.js`の`fetchWebPage`関数を編集することで、特定の要素のみを抽出したり、不要な要素を除外したりできます。

### 解析結果の表示件数変更
- テキスト長制限: `server.js`の`fetchWebPage`関数内の`substring(0, 5000)`
- 形態素表示数: `server.js`の`tokens.slice(0, 100)`

## ライセンス

MIT
