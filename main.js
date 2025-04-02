async function translate(text, from, to, options) {
    // 从 options 中解构所需的对象和函数
    const { config, utils, detect, plugin, setResult } = options;
    const { tauriFetch, http } = utils; // tauriFetch 用于非流式, http.fetch 用于流式
    const { fetch: tauriHttpFetch, Body, ResponseType } = http; // 使用 tauri 提供的 fetch 处理流

    // --- 读取配置 ---
    const apiKey = config.apiKey;
    const modelName = config.modelName;
    const systemPrompt = config.systemPrompt || "";
    // 读取流式配置，将字符串 "true" 转为布尔值 true
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

    // --- 语言处理 --- (与之前相同)
    const targetLang = plugin.langMap[to] || to;
    let sourceLangPrompt = "";
    if (from !== 'auto') {
        const sourceLang = plugin.langMap[from] || from;
        sourceLangPrompt = ` from language code "${sourceLang}"`;
    } else if (detect && detect !== 'auto') {
        const detectedLang = plugin.langMap[detect] || detect;
        sourceLangPrompt = ` from the detected language "${detectedLang}"`;
    }
    const targetLangPrompt = ` to language code "${targetLang}"`;

    // --- 构建 Prompt --- (与之前相同)
    const translationTask = `Translate the following text${sourceLangPrompt}${targetLangPrompt}. Output ONLY the translated text, without any introductory phrases, explanations, or markdown formatting like quotes or code blocks.\n\nText to translate:\n"${text}"\n\nTranslated text:`;
    let finalApiPrompt = "";
    if (systemPrompt && systemPrompt.trim().length > 0) {
        finalApiPrompt += systemPrompt.trim() + "\n\n---\n\n";
    }
    finalApiPrompt += translationTask;

    // --- 构建请求体 --- (流式和非流式通用)
    const requestBody = {
        contents: [{ parts: [{ text: finalApiPrompt }] }],
        generationConfig: { /* ... temperature etc. if needed ... */ },
        safetySettings: [ /* ... if needed ... */ ]
    };

    // --- 根据 enableStreaming 选择执行路径 ---
    if (enableStreaming) {
        // ==========================
        // --- 流式输出逻辑 ---
        // ==========================
        const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKey}&alt=sse`; // 使用 SSE 端点

        try {
            console.log("Gemini Streaming Request Body:", JSON.stringify(requestBody)); // Log 请求体
            const response = await tauriHttpFetch(streamUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: Body.json(requestBody),
                responseType: ResponseType.Text, // 获取文本形式的 SSE 事件流
                timeout: 60, // 流式请求可能需要更长超时时间
            });

             console.log("Gemini Streaming Response Status:", response.status); // Log 状态码
            // console.log("Gemini Streaming Response Headers:", response.headers); // Log 响应头（可选）

            if (!response.ok) {
                // 处理 HTTP 错误
                let errorMsg = `Gemini API 流式请求失败。\nHTTP 状态码: ${response.status}`;
                let responseDataText = response.data || ""; // 获取响应体文本
                console.error("Gemini Streaming Error Response Body:", responseDataText); // Log 错误响应体
                try {
                    const errorData = JSON.parse(responseDataText);
                    if (errorData && errorData.error && errorData.error.message) {
                        errorMsg += `\n错误信息: ${errorData.error.message}`;
                        // 添加特定错误提示
                        if (errorData.error.message.includes('API key not valid')) { errorMsg += '\n(请检查 API Key)'; }
                        else if (errorData.error.message.includes('models/') && errorData.error.message.includes('found')) { errorMsg += `\n(请检查模型 "${modelName}")`; }
                    } else { errorMsg += `\n响应: ${responseDataText}`; }
                } catch (e) { errorMsg += `\n响应: ${responseDataText}`; }
                throw errorMsg;
            }

            // --- 处理 SSE 流 ---
            // tauriHttpFetch + ResponseType.Text 似乎会等待整个流结束后才返回完整的文本数据
            // 这意味着我们不是在数据到达时实时处理，而是在整个流结束后，模拟流式效果。
            // 这是一个常见的折衷，除非 Tauri 提供真正的流式读取回调。
            const sseData = response.data;
            // console.log("Received SSE Data:\n", sseData); // 调试：打印完整的 SSE 数据

            const lines = sseData.split('\n');
            let accumulatedText = "";
            let lastSentText = ""; // 记录上次发送的文本，避免重复发送相同内容

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const jsonData = line.substring(5).trim();
                    if (jsonData) {
                        try {
                            const chunk = JSON.parse(jsonData);
                            // 提取文本部分
                            if (chunk.candidates && chunk.candidates.length > 0 &&
                                chunk.candidates[0].content && chunk.candidates[0].content.parts && chunk.candidates[0].content.parts.length > 0)
                            {
                                const textPart = chunk.candidates[0].content.parts[0].text;
                                if (textPart) {
                                    accumulatedText += textPart;
                                    // 只有当累积文本发生变化时才调用 setResult
                                    if (accumulatedText !== lastSentText) {
                                        setResult(accumulatedText); // 增量更新 Pot-App 界面
                                        lastSentText = accumulatedText; // 更新上次发送的文本
                                        // console.log("Streaming update:", accumulatedText); // 调试
                                    }
                                }
                            }
                            // 检查是否有错误或非正常结束原因
                            if (chunk.candidates && chunk.candidates[0].finishReason && chunk.candidates[0].finishReason !== "STOP") {
                                console.warn("Gemini stream 非正常结束:", chunk.candidates[0].finishReason, chunk.candidates[0].safetyRatings || "");
                                // 可以在这里附加警告信息给用户，或者直接停止
                                // setResult(accumulatedText + `\n[Stream stopped: ${chunk.candidates[0].finishReason}]`);
                            }

                        } catch (e) {
                            console.error("解析 SSE JSON 块时出错:", jsonData, e);
                            // 可以选择忽略解析错误的块或抛出错误
                        }
                    }
                }
            }
            // 流处理完毕

            // 可选：最后再进行一次清理（虽然 Prompt 已要求纯文本，但模型可能不完全遵守）
            // let finalCleanedText = accumulatedText.trim();
            // // 移除可能的 Markdown 格式
            // finalCleanedText = finalCleanedText.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
            // if (finalCleanedText.startsWith('"') && finalCleanedText.endsWith('"')) {
            //     finalCleanedText = finalCleanedText.substring(1, finalCleanedText.length - 1);
            // }
            // if (finalCleanedText !== lastSentText) {
            //      setResult(finalCleanedText); // 确保最终结果被发送
            // }

            // 流式处理函数不返回值，结果通过 setResult 发送
            return;

        } catch (error) {
            console.error("Gemini 流式翻译出错:", error);
            // 向上抛出错误信息字符串
            throw error instanceof Error ? error.message : String(error);
        }

    } else {
        // ==========================
        // --- 非流式输出逻辑 --- (使用原始 tauriFetch)
        // ==========================
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        try {
            // 注意这里用回了 options.utils.tauriFetch，它可能封装了不同的行为
            const res = await tauriFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // tauriFetch 可能需要 Body.json 封装，根据原始代码推断
                 body: http.Body.json(requestBody), // 确保 Body 使用正确
                timeout: 30,
            });

            if (res.ok) {
                const result = res.data;
                if (result.candidates && result.candidates.length > 0 &&
                    result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0)
                {
                    let translation = result.candidates[0].content.parts[0].text.trim();
                    // 清理逻辑 (同之前)
                    translation = translation.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
                    if (translation.startsWith('"') && translation.endsWith('"')) {
                         translation = translation.substring(1, translation.length - 1);
                    }
                    return translation; // 非流式，直接返回结果字符串
                } else if (result.promptFeedback) {
                     let blockReason = result.promptFeedback.blockReason || JSON.stringify(result.promptFeedback.safetyRatings);
                     throw new Error(`Gemini API 请求被阻止: ${blockReason}`);
                } else if (!result.candidates || result.candidates.length === 0) {
                     throw new Error(`Gemini API 未返回有效的翻译结果。`);
                } else {
                    throw new Error(`Gemini API 响应结构异常: ${JSON.stringify(result)}`);
                }
            } else {
                // 处理 HTTP 错误 (同之前)
                let errorMsg = `Gemini API 请求失败。\nHTTP 状态码: ${res.status}`;
                 try {
                     const errorData = res.data; // data 可能已经是解析好的对象或原始文本
                     let errorDetail = "";
                     if (typeof errorData === 'string') errorDetail = errorData;
                     else if (errorData && errorData.error && errorData.error.message) errorDetail = errorData.error.message;
                     else errorDetail = JSON.stringify(errorData);

                     errorMsg += `\n错误信息: ${errorDetail}`;
                     // 添加特定错误提示
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