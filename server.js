const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const kuromoji = require('kuromoji');
const path = require('path');

const app = express();
const PORT = 3000;

// 静的ファイルの提供
app.use(express.static('public'));
app.use(express.json());

// kuromojiのトークナイザーをキャッシュ
let tokenizer = null;

// トークナイザーの初期化
const initTokenizer = () => {
  return new Promise((resolve, reject) => {
    if (tokenizer) {
      resolve(tokenizer);
      return;
    }
    
    kuromoji.builder({ dicPath: 'node_modules/kuromoji/dict' }).build((err, tok) => {
      if (err) {
        reject(err);
      } else {
        tokenizer = tok;
        resolve(tokenizer);
      }
    });
  });
};

// Webページを取得してテキストを抽出
const fetchWebPage = async (url) => {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);

    // 不要な要素を除去
    $('script').remove();
    $('style').remove();
    $('noscript').remove();
    $('iframe').remove();
    $('nav').remove();
    $('header').remove();
    $('footer').remove();
    $('aside').remove();

    // テキストコンテンツを抽出
    const title = $('title').text().trim();
    let bodyText = $('body').text();

    // HTMLタグを除去（念のため）
    bodyText = bodyText.replace(/<[^>]*>/g, '');

    // HTMLエンティティをデコード
    bodyText = bodyText
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");

    // 連続する空白を1つに統一
    bodyText = bodyText
      .replace(/\s+/g, ' ')
      .trim();

    return {
      title,
      text: bodyText
    };
  } catch (error) {
    throw new Error(`Webページの取得に失敗しました: ${error.message}`);
  }
};

// 形態素解析API
app.post('/api/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URLが指定されていません' });
    }
    
    // URLの検証（簡易版）
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({ error: '有効なURLを入力してください' });
    }
    
    // Webページを取得
    const { title, text } = await fetchWebPage(url);
    
    // トークナイザーの初期化
    const tok = await initTokenizer();
    
    // 形態素解析
    const tokens = tok.tokenize(text);
    
    // 結果を整形
    const result = {
      url,
      title,
      bodyText: text,
      textLength: text.length,
      tokenCount: tokens.length,
      tokens: tokens.map(token => ({
        surface: token.surface_form,
        pos: token.pos,
        posDetail1: token.pos_detail_1,
        posDetail2: token.pos_detail_2,
        posDetail3: token.pos_detail_3,
        baseForm: token.basic_form,
        reading: token.reading,
        pronunciation: token.pronunciation
      })),
      summary: generateSummary(tokens)
    };
    
    res.json(result);
  } catch (error) {
    console.error('エラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// 簡易的な統計情報を生成
const generateSummary = (tokens) => {
  const posCount = {};
  const wordFreq = {};
  
  tokens.forEach(token => {
    // 品詞のカウント
    posCount[token.pos] = (posCount[token.pos] || 0) + 1;
    
    // 名詞の頻度カウント（助詞等を除く）
    if (token.pos === '名詞' && token.surface_form.length > 1) {
      wordFreq[token.surface_form] = (wordFreq[token.surface_form] || 0) + 1;
    }
  });
  
  // 頻出語トップ10
  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));
  
  return {
    posCount,
    topWords
  };
};

// サーバー起動
const startServer = async () => {
  try {
    console.log('形態素解析エンジンを初期化中...');
    await initTokenizer();
    console.log('初期化完了！');
    
    app.listen(PORT, () => {
      console.log(`サーバーが起動しました: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('サーバーの起動に失敗しました:', error);
    process.exit(1);
  }
};

startServer();
