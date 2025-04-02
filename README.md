# Pot-App Google Gemini 翻译插件

这是一款为 [Pot-App](https://github.com/pot-app/pot-app) 开发的翻译插件，利用强大的 Google Gemini API 提供高质量、可定制的文本翻译服务。

## 主要功能

*   **Gemini API 驱动**: 利用 Google 先进的 AI 模型进行翻译。
*   **模型选择**: 支持用户自行指定使用的 Gemini 模型（例如 `gemini-1.5-pro-latest`, `gemini-1.5-flash-latest` 等），默认为 `gemini-2.0-flash` (**请注意**: 请确保此模型在您的区域可用且已被 Google 正式发布)。
*   **自定义系统指令 (System Prompt)**: 允许用户添加自定义指令来引导 Gemini 的翻译风格、语气或特定要求。
*   **流式输出**: 可选开启流式输出，让翻译结果逐步显示，提供更即时的反馈。
*   **多语言支持**: 利用 Gemini 的多语言能力，支持 Pot-App 中定义的多种语言对。

## 配置指南

在使用此插件前，您需要在 Pot-App 的插件设置中进行配置：

1.  **安装插件**: 下载 `.potext` 文件，并在 Pot-App 的设置 -> 插件 -> 安装本地插件处进行安装。
2.  **进入配置**: 在 Pot-App 设置 -> 翻译 -> 服务提供方 中找到 "Google Gemini"，点击配置按钮。

您需要配置以下选项：

*   ### Gemini API Key
    *   **作用**: 用于认证您的 API 请求。
    *   **获取**: 您需要前往 [Google AI Studio](https://aistudio.google.com/app/apikey) 或 Google Cloud Console 创建并获取您的 API 密钥。
    *   **注意**: API Key 是敏感信息，请妥善保管，切勿泄露或分享。

*   ### Gemini 模型名称
    *   **作用**: 指定调用哪个 Gemini 模型进行翻译。
    *   **默认值**: `gemini-2.0-flash`
    *   **说明**: 您可以根据需求修改为其他可用的 Gemini 模型，例如 `gemini-1.5-pro-latest` (质量更高，可能稍慢) 或 `gemini-1.5-flash-latest` (速度更快)。
    *   **重要**: 请确保您填写的模型名称是 Google Gemini API 当前支持的有效名称，并且在您所在的区域可用。否则 API 调用会失败。请参考 [Google AI 官方文档](https://ai.google.dev/models/gemini) 获取可用模型列表。

*   ### 自定义系统指令 (System Prompt)
    *   **作用**: (可选) 在发送给 Gemini 的翻译请求前添加一段自定义指令，用以影响翻译行为。
    *   **示例**:
        *   `请使用正式、专业的语气进行翻译。`
        *   `Translate the text into modern standard {target_language}. Keep the translation concise.` (可以使用 `{target_language}` 这样的占位符，但插件目前**未**实现自动替换，这里仅为示例想法)
        *   `将结果翻译成中文，并尽可能保留原始文本的段落格式。`
    *   **默认值**: 空 (不添加任何自定义指令)

*   ### 启用流式输出
    *   **作用**: 控制翻译结果的返回方式。
    *   **选项**:
        *   `否 (No)`: (默认) 等待 Gemini 完成全部翻译后，一次性显示结果。
        *   `是 (Yes)`: 开启流式输出，翻译结果会随着 API 返回逐步显示出来。
    *   **说明**: 流式输出可以提供更快的初始反馈，但最终结果需要等待传输完成。

## 使用方法

1.  完成插件的安装和配置。
2.  在 Pot-App 的翻译设置中，选择 "Google Gemini" 作为您的活动翻译服务之一。
3.  像往常一样使用 Pot-App 的划词翻译、截图翻译或输入翻译功能即可。

## 注意事项

*   **API 费用**: 使用 Google Gemini API 可能会产生费用。请查阅 [Google AI 定价页面](https://ai.google.dev/pricing) 了解详细信息，并根据需要设置预算提醒。
*   **模型可用性**: `gemini-2.0-flash` 或您指定的任何模型名称必须是 Google 官方支持且在您账户和区域内可用的。如果遇到模型找不到的错误，请检查模型名称拼写和可用性。
*   **系统指令效果**: 自定义系统指令的效果取决于模型的理解能力和您指令的清晰度，可能需要多次尝试才能达到预期效果。过于复杂的指令可能导致翻译质量下降或无结果。
*   **流式输出体验**: 流式输出是基于 API 返回的数据块进行更新的，其“流畅度”取决于网络状况和 API 的响应速度。

## 开发与构建 

*   此插件基于 [Pot-App 翻译插件模板仓库](https://github.com/pot-app/pot-app-translate-plugin-template) 构建。
*   主要逻辑在 `main.js` 中实现，插件信息和配置定义在 `info.json`。
*   **构建**: 将 `main.js`, `info.json` 和图标文件 (`gemini.svg`) 打包成一个 ZIP 压缩文件，然后将后缀名 `.zip` 修改为 `.potext` 即可得到 Pot-App 插件包。例如：`plugin.com.yourname.gemini.potext`。
*   本仓库可能配置了 GitHub Actions 以自动打包发布版本。

## 许可证

[GPL-3.0 license](LICENSE)