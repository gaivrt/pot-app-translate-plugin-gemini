async function translate(text, from, to, options) {
    // 从 options 中解构所需的对象和函数
    const { config, utils, detect } = options;
    const { tauriFetch, http } = utils;

    // --- 读取配置 ---
    const apiKey = config.apiKey;
    const modelName = config.modelName;
    const systemPrompt = config.systemPrompt || "";

    // --- 输入校验 ---
    if (!text || text.trim() === "") {
      return "";
    }
    if (!apiKey) {
        throw new Error('请在插件配置中设置 Gemini API Key。');
    }
    if (!modelName) {
        throw new Error('请在插件配置中设置 Gemini 模型名称。');
    }

    // --- 语言处理 ---
    // 直接使用 Pot-App 传入的 `to` 代码，假设它已经被映射过
    const targetLang = to;
    let sourceLangPrompt = "";
    // 处理源语言: 仍然需要区分 'auto'
    if (from !== 'auto') {
        // 直接使用 Pot-App 传入的 `from` 代码
        sourceLangPrompt = ` from language code "${from}"`;
    } else if (detect && detect !== 'auto') {
        // 如果是 auto, 且 Pot-App 检测到了语言 (detect)，使用检测到的代码
        sourceLangPrompt = ` from the detected language "${detect}"`;
    }
    // 目标语言提示
    // const targetLangPrompt = ` to language code "${targetLang}"`;

    // --- 构建 Prompt ---
    const translationTask = `\n source language is ${sourceLangPrompt}, target laguage is ${targetLang}, text is ${text}`;
    let finalApiPrompt = "";
    if (systemPrompt && systemPrompt.trim().length > 0) {
        finalApiPrompt += systemPrompt.trim() + "\n\n---\n\n";
    }
    finalApiPrompt += translationTask;

    // --- 构建请求体 ---
    const requestBody = {
        contents: [{ parts: [{ text: finalApiPrompt }] }],
        generationConfig: { 
            thinkingConfig: {
                thinkingBudget: 1,
            },
        },
    };

    // --- 发送请求 ---
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    try {
        const res = await tauriFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: http.Body.json(requestBody),
            timeout: 30,
        });

        if (res.ok) {
            const result = res.data;
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0)
            {
                let translation = result.candidates[0].content.parts[0].text.trim();
                // 清理逻辑
                translation = translation.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
                if (translation.startsWith('"') && translation.endsWith('"')) {
                     translation = translation.substring(1, translation.length - 1);
                }
                return translation;
            } else if (result.promptFeedback) {
                 let blockReason = result.promptFeedback.blockReason || JSON.stringify(result.promptFeedback.safetyRatings);
                 throw new Error(`Gemini API 请求被阻止: ${blockReason}`);
            } else if (!result.candidates || result.candidates.length === 0) {
                 throw new Error(`Gemini API 未返回有效的翻译结果。`);
            } else {
                throw new Error(`Gemini API 响应结构异常: ${JSON.stringify(result)}`);
            }
        } else {
            // 处理 HTTP 错误
            let errorMsg = `Gemini API 请求失败。\nHTTP 状态码: ${res.status}`;
            try {
                const errorData = res.data;
                let errorDetail = "";
                if (typeof errorData === 'string') errorDetail = errorData;
                else if (errorData && errorData.error && errorData.error.message) errorDetail = errorData.error.message;
                else errorDetail = JSON.stringify(errorData);

                errorMsg += `\n错误信息: ${errorDetail}`;
                if (errorDetail.includes('API key not valid')) { errorMsg += '\n(请检查 API Key)'; }
                else if (errorDetail.includes('models/') && errorDetail.includes('found')) { errorMsg += `\n(请检查模型 "${modelName}")`; }

            } catch (e) { errorMsg += `\n无法解析错误响应。`; }
            throw errorMsg;
        }
    } catch (error) {
        console.error("Gemini 翻译出错:", error);
        throw error instanceof Error ? error.message : String(error);
    }
}