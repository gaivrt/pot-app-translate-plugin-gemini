async function translate(text, from, to, options) {
    // 从 options 中解构所需的对象和函数 (移除了 plugin)
    const { config, utils, detect, setResult } = options;
    const { tauriFetch, http } = utils;
    const { fetch: tauriHttpFetch, Body, ResponseType } = http;

    // --- 读取配置 ---
    const apiKey = config.apiKey;
    const modelName = config.modelName;
    const systemPrompt = config.systemPrompt || "";
    const enableStreaming = config.enableStreaming === 'true';

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
        // 假设 detect 也被映射过了
        sourceLangPrompt = ` from the detected language "${detect}"`;
    }
    // 如果 from 是 'auto' 且 detect 也是 'auto' 或未提供, sourceLangPrompt 会是空字符串
    // 目标语言提示
    const targetLangPrompt = ` to language code "${targetLang}"`;


    // --- 构建 Prompt --- (基本不变, 使用了更新后的语言提示)
    const translationTask = `Translate the following text${sourceLangPrompt}${targetLangPrompt}. Output ONLY the translated text, without any introductory phrases, explanations, or markdown formatting like quotes or code blocks.\n\nText to translate:\n"${text}"\n\nTranslated text:`;
    let finalApiPrompt = "";
    if (systemPrompt && systemPrompt.trim().length > 0) {
        finalApiPrompt += systemPrompt.trim() + "\n\n---\n\n";
    }
    finalApiPrompt += translationTask;

    // --- 构建请求体 --- (不变)
    const requestBody = {
        contents: [{ parts: [{ text: finalApiPrompt }] }],
        // generationConfig: { ... },
        // safetySettings: [ ... ]
    };

    // --- 根据 enableStreaming 选择执行路径 ---
    if (enableStreaming) {
        // ==========================
        // --- 流式输出逻辑 --- (内部逻辑不变)
        // ==========================
        const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKey}&alt=sse`;

        try {
            // console.log("Gemini Streaming Request Body:", JSON.stringify(requestBody));
            const response = await tauriHttpFetch(streamUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: Body.json(requestBody),
                responseType: ResponseType.Text,
                timeout: 60,
            });

            // console.log("Gemini Streaming Response Status:", response.status);

            if (!response.ok) {
                let errorMsg = `Gemini API 流式请求失败。\nHTTP 状态码: ${response.status}`;
                let responseDataText = response.data || "";
                // console.error("Gemini Streaming Error Response Body:", responseDataText);
                try {
                    const errorData = JSON.parse(responseDataText);
                    if (errorData && errorData.error && errorData.error.message) {
                        errorMsg += `\n错误信息: ${errorData.error.message}`;
                        if (errorData.error.message.includes('API key not valid')) { errorMsg += '\n(请检查 API Key)'; }
                        else if (errorData.error.message.includes('models/') && errorData.error.message.includes('found')) { errorMsg += `\n(请检查模型 "${modelName}")`; }
                    } else { errorMsg += `\n响应: ${responseDataText}`; }
                } catch (e) { errorMsg += `\n响应: ${responseDataText}`; }
                throw errorMsg;
            }

            const sseData = response.data;
            const lines = sseData.split('\n');
            let accumulatedText = "";
            let lastSentText = "";

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const jsonData = line.substring(5).trim();
                    if (jsonData) {
                        try {
                            const chunk = JSON.parse(jsonData);
                            if (chunk.candidates && chunk.candidates.length > 0 &&
                                chunk.candidates[0].content && chunk.candidates[0].content.parts && chunk.candidates[0].content.parts.length > 0)
                            {
                                const textPart = chunk.candidates[0].content.parts[0].text;
                                if (textPart) {
                                    accumulatedText += textPart;
                                    if (accumulatedText !== lastSentText) {
                                        setResult(accumulatedText);
                                        lastSentText = accumulatedText;
                                    }
                                }
                            }
                            if (chunk.candidates && chunk.candidates[0].finishReason && chunk.candidates[0].finishReason !== "STOP") {
                                console.warn("Gemini stream 非正常结束:", chunk.candidates[0].finishReason, chunk.candidates[0].safetyRatings || "");
                            }
                        } catch (e) {
                            console.error("解析 SSE JSON 块时出错:", jsonData, e);
                        }
                    }
                }
            }
            return; // 流式处理函数不返回值

        } catch (error) {
            console.error("Gemini 流式翻译出错:", error);
            throw error instanceof Error ? error.message : String(error);
        }

    } else {
        // ==========================
        // --- 非流式输出逻辑 --- (内部逻辑不变)
        // ==========================
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        try {
            const res = await tauriFetch(url, { // 使用原始的 tauriFetch
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: http.Body.json(requestBody), // 确保使用正确的 Body 封装
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
                    return translation; // 非流式，返回结果字符串
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
            console.error("Gemini 非流式翻译出错:", error);
            throw error instanceof Error ? error.message : String(error);
        }
    }
}