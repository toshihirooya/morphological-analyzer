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

// テキストのクリーニング関数
const cleanText = (text) => {
  return text
    .replace(/<[^>]*>/g, '') // HTMLタグを除去
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

// Webページを取得してタグごとにテキストを抽出
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

    // タグごとにテキストを抽出
    const titleText = cleanText($('title').text());
    const h1Text = cleanText($('h1').map((i, el) => $(el).text()).get().join(' '));
    const h2Text = cleanText($('h2').map((i, el) => $(el).text()).get().join(' '));
    const bodyText = cleanText($('body').text());

    return {
      title: titleText,
      h1: h1Text,
      h2: h2Text,
      body: bodyText,
      text: bodyText // 全体のテキスト（後方互換性のため）
    };
  } catch (error) {
    throw new Error(`Webページの取得に失敗しました: ${error.message}`);
  }
};

// 単一URL形態素解析API
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
    const pageData = await fetchWebPage(url);

    // トークナイザーの初期化
    const tok = await initTokenizer();

    // 各タグごとに形態素解析
    const analyzeTag = (text) => {
      if (!text) return { tokens: [], summary: { topWords: [] } };
      const tokens = tok.tokenize(text);
      return {
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
        summary: generateSummary(tokens, text.length)
      };
    };

    // タグごとの解析結果
    const titleAnalysis = analyzeTag(pageData.title);
    const h1Analysis = analyzeTag(pageData.h1);
    const h2Analysis = analyzeTag(pageData.h2);
    const bodyAnalysis = analyzeTag(pageData.body);

    // 全体の形態素解析（後方互換性のため）
    const tokens = tok.tokenize(pageData.text);

    // 結果を整形
    const result = {
      url,
      title: pageData.title,
      bodyText: pageData.body,
      textLength: pageData.text.length,
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
      summary: generateSummary(tokens, pageData.text.length),
      // タグごとの解析結果
      byTag: {
        title: {
          text: pageData.title,
          textLength: pageData.title.length,
          tokenCount: titleAnalysis.tokens.length,
          summary: titleAnalysis.summary
        },
        h1: {
          text: pageData.h1,
          textLength: pageData.h1.length,
          tokenCount: h1Analysis.tokens.length,
          summary: h1Analysis.summary
        },
        h2: {
          text: pageData.h2,
          textLength: pageData.h2.length,
          tokenCount: h2Analysis.tokens.length,
          summary: h2Analysis.summary
        },
        body: {
          text: pageData.body,
          textLength: pageData.body.length,
          tokenCount: bodyAnalysis.tokens.length,
          summary: bodyAnalysis.summary
        }
      }
    };

    res.json(result);
  } catch (error) {
    console.error('エラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// 複数URL一括形態素解析API
app.post('/api/analyze-multiple', async (req, res) => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLリストが指定されていません' });
    }

    if (urls.length > 20) {
      return res.status(400).json({ error: 'URLは最大20件までです' });
    }

    // トークナイザーの初期化
    const tok = await initTokenizer();

    const results = [];
    const errors = [];

    // 各URLを順次処理
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i].trim();

      // URLの検証
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        errors.push({ url, error: '無効なURL形式' });
        continue;
      }

      try {
        // Webページを取得
        const pageData = await fetchWebPage(url);

        // 各タグごとに形態素解析
        const analyzeTag = (text) => {
          if (!text) return { tokens: [], summary: { topWords: [] } };
          const tokens = tok.tokenize(text);
          return {
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
            summary: generateSummary(tokens, text.length)
          };
        };

        // タグごとの解析結果
        const titleAnalysis = analyzeTag(pageData.title);
        const h1Analysis = analyzeTag(pageData.h1);
        const h2Analysis = analyzeTag(pageData.h2);
        const bodyAnalysis = analyzeTag(pageData.body);

        // 全体の形態素解析（後方互換性のため）
        const tokens = tok.tokenize(pageData.text);

        results.push({
          url,
          title: pageData.title,
          bodyText: pageData.body,
          textLength: pageData.text.length,
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
          summary: generateSummary(tokens, pageData.text.length),
          // タグごとの解析結果
          byTag: {
            title: {
              text: pageData.title,
              textLength: pageData.title.length,
              tokenCount: titleAnalysis.tokens.length,
              summary: titleAnalysis.summary
            },
            h1: {
              text: pageData.h1,
              textLength: pageData.h1.length,
              tokenCount: h1Analysis.tokens.length,
              summary: h1Analysis.summary
            },
            h2: {
              text: pageData.h2,
              textLength: pageData.h2.length,
              tokenCount: h2Analysis.tokens.length,
              summary: h2Analysis.summary
            },
            body: {
              text: pageData.body,
              textLength: pageData.body.length,
              tokenCount: bodyAnalysis.tokens.length,
              summary: bodyAnalysis.summary
            }
          }
        });
      } catch (error) {
        errors.push({ url, error: error.message });
      }
    }

    // 全サイトの統合サマリーを生成
    const aggregatedSummary = generateAggregatedSummary(results);

    res.json({
      success: true,
      totalUrls: urls.length,
      successCount: results.length,
      errorCount: errors.length,
      results,
      errors,
      aggregatedSummary
    });
  } catch (error) {
    console.error('エラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// 簡易的な統計情報を生成
const generateSummary = (tokens, totalTextLength) => {
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

  // 頻出語トップ10（文字数と割合を計算）
  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => {
      const totalChars = word.length * count;
      const percentage = ((totalChars / totalTextLength) * 100).toFixed(2);
      return {
        word,
        count,
        totalChars,
        percentage: parseFloat(percentage)
      };
    });

  return {
    posCount,
    topWords
  };
};

// 複数サイトの統合サマリーを生成
const generateAggregatedSummary = (results) => {
  const wordFreq = {};
  const tagWordFreq = {
    title: {},
    h1: {},
    h2: {},
    body: {}
  };
  let totalTextLength = 0;
  const tagTextLength = {
    title: 0,
    h1: 0,
    h2: 0,
    body: 0
  };

  // 全サイトの単語を集計
  results.forEach(result => {
    totalTextLength += result.textLength;

    // 全体の単語集計
    result.tokens.forEach(token => {
      // 名詞の頻度カウント
      if (token.pos === '名詞' && token.surface.length > 1) {
        if (!wordFreq[token.surface]) {
          wordFreq[token.surface] = {
            count: 0,
            sites: new Set()
          };
        }
        wordFreq[token.surface].count++;
        wordFreq[token.surface].sites.add(result.url);
      }
    });

    // タグごとの単語集計
    ['title', 'h1', 'h2', 'body'].forEach(tagName => {
      if (result.byTag && result.byTag[tagName]) {
        tagTextLength[tagName] += result.byTag[tagName].textLength;

        if (result.byTag[tagName].summary && result.byTag[tagName].summary.topWords) {
          result.byTag[tagName].summary.topWords.forEach(wordData => {
            const word = wordData.word;
            if (!tagWordFreq[tagName][word]) {
              tagWordFreq[tagName][word] = {
                count: 0,
                sites: new Set()
              };
            }
            tagWordFreq[tagName][word].count += wordData.count;
            tagWordFreq[tagName][word].sites.add(result.url);
          });
        }
      }
    });
  });

  // 頻出語トップ20（サイト数順、次に出現回数順）
  const topWords = Object.entries(wordFreq)
    .sort((a, b) => {
      // まずサイト数で降順ソート
      if (b[1].sites.size !== a[1].sites.size) {
        return b[1].sites.size - a[1].sites.size;
      }
      // サイト数が同じ場合は出現回数でソート
      return b[1].count - a[1].count;
    })
    .slice(0, 20)
    .map(([word, data]) => {
      const totalChars = word.length * data.count;
      const percentage = ((totalChars / totalTextLength) * 100).toFixed(2);
      const sitePercentage = ((data.sites.size / results.length) * 100).toFixed(1);
      return {
        word,
        count: data.count,
        siteCount: data.sites.size,
        sitePercentage: parseFloat(sitePercentage),
        totalChars,
        percentage: parseFloat(percentage)
      };
    });

  // タグごとの頻出語トップ20を生成
  const generateTagTopWords = (tagName) => {
    return Object.entries(tagWordFreq[tagName])
      .sort((a, b) => {
        if (b[1].sites.size !== a[1].sites.size) {
          return b[1].sites.size - a[1].sites.size;
        }
        return b[1].count - a[1].count;
      })
      .slice(0, 20)
      .map(([word, data]) => {
        const totalChars = word.length * data.count;
        const percentage = tagTextLength[tagName] > 0
          ? ((totalChars / tagTextLength[tagName]) * 100).toFixed(2)
          : '0.00';
        const sitePercentage = ((data.sites.size / results.length) * 100).toFixed(1);
        return {
          word,
          count: data.count,
          siteCount: data.sites.size,
          sitePercentage: parseFloat(sitePercentage),
          totalChars,
          percentage: parseFloat(percentage)
        };
      });
  };

  return {
    totalSites: results.length,
    totalTextLength,
    topWords,
    byTag: {
      title: {
        totalTextLength: tagTextLength.title,
        topWords: generateTagTopWords('title')
      },
      h1: {
        totalTextLength: tagTextLength.h1,
        topWords: generateTagTopWords('h1')
      },
      h2: {
        totalTextLength: tagTextLength.h2,
        topWords: generateTagTopWords('h2')
      },
      body: {
        totalTextLength: tagTextLength.body,
        topWords: generateTagTopWords('body')
      }
    }
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
