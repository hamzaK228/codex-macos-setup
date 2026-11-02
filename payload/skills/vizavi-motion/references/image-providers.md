# Изображения: условный выбор источника

Читай только когда нужны изображения/reference editing. Актуальность переданного исследования — **16.10.2026**. Проверялась документация, не практическое сохранение идентичности персонажа. Сведения ниже не устанавливают интеграции и не означают доступ к аккаунту. Используй уже доступный разрешённый инструмент; новая регистрация, MCP/API или локальный backend не включаются автоматически. При недоступности одного маршрута выбирай другой, сохраняя постановку и честные ограничения.

## Основные кандидаты

### Krea — готовый MCP-кандидат

[Официальная инструкция](https://www.krea.ai/docs/developers/mcp), endpoint: `https://api.krea.ai/mcp`.
MCP через OAuth расходует compute units рабочего пространства; API-token расходует **отдельный платный API balance**. Не смешивай эти способы оплаты.

По [pricing](https://www.krea.ai/pricing), Free даёт 100 units ежедневно без карты. Ориентиры страницы — около 25 Klein или 5 Krea 3 Beta изображений в день; это **не гарантированное число reference edits**. Не обещай бесплатные Nano Banana/GPT Image. MCP описывает discovery/schema, references через URL/base64/upload, jobs и получение результата; фактическую схему выбранного инструмента читай перед вызовом.

[Krea 3](https://www.krea.ai/blog/introducing-krea-3) заявляет до 6 references; стабильность персонажа в исследовании не тестировалась. Коммерческая лицензия указана для платных планов; Free рассматривай как маршрут личного теста, не обещай его пригодность для монетизированного финала. Native alpha не подтверждён: скачай результат и при необходимости удали фон локально с проверкой края.

### Cloudflare Workers AI — REST-кандидат, не готовый универсальный MCP

[Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/): Free 10000 neurons/day, сброс в 00:00 UTC, без платного перерасхода на Free; [продуктовая страница](https://www.cloudflare.com/products/workers-ai/) указывает вход без карты. Neurons — вычислительные единицы, **не число готовых картинок**.

У [FLUX.2 Klein 4B](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/) по [объявлению схемы](https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/) вход multipart: до 4 binary-полей `input_image_0`…`input_image_3`, каждый reference **меньше 512×512**; выходные размеры 256…1920, результат base64. Не подменяй это другой схемой или лимитом модели.

[REST API](https://developers.cloudflare.com/workers-ai/get-started/rest-api/) требует узкого adapter/script в подходящем клиенте, если он будет отдельно разрешён. Общий `https://mcp.cloudflare.com/mcp` не проверен для этого потока; turnkey MCP не обещай. Native alpha не подтверждён.

### Веб-интерфейсы как резерв

[Gemini web](https://support.google.com/gemini/answer/14286560?hl=en) описывает reference editing и скачивание; [лимиты плавающие](https://support.google.com/gemini/answer/16275805?hl=en). Это **не бесплатный image API** — [API pricing](https://ai.google.dev/gemini-api/docs/pricing) рассматривается отдельно. Автоматизация возможна только при фактически доступном browser tool; обычный чат сам по себе не означает наличие браузера.

[Images in ChatGPT](https://help.openai.com/en/articles/11084440-images-in-chatgpt) — аналогичный веб-резерв, в том числе для запроса прозрачности. ChatGPT Free не означает бесплатный API, а запрос transparency не заменяет проверку alpha результата.

## Дополнительные варианты и границы бесплатности

| Вариант | Что подтверждено документацией и чего не обещать |
|---|---|
| [Leonardo pricing](https://leonardo.ai/pricing) | 150 tokens/day, free-работы публичные, API отдельно. [Image guidance](https://intercom.help/leonardo-ai/en/articles/8497988-image-guidance) — Limited. [Transparency](https://intercom.help/leonardo-ai/en/articles/9075772-transparency) описана для подходящих SD1.5/SDXL; сочетание reference+alpha на Free требует фактической проверки. |
| [Ideogram plans](https://docs.ideogram.ai/plans-and-billing/available-plans.md) | 30 credits/week при Google/Apple/Microsoft login; free-работы публичные. Бесплатный API не обещай. |
| [Hugging Face Inference](https://huggingface.co/docs/inference-providers/main/pricing) и [ZeroGPU Spaces](https://huggingface.co/docs/hub/main/spaces-zerogpu) | $0.10/month в Inference; очереди и квоты в Spaces. Это не надёжный производственный backend по умолчанию. |
| [Pollinations Pollen FAQ](https://raw.githubusercontent.com/pollinations/pollinations/main/enter.pollinations.ai/POLLEN_FAQ.md) | Купленные/заработанные Pollen. Не считать unlimited или бесплатным ежедневным image API. |
| [Recraft Free](https://www.recraft.ai/docs/plans-and-billing/free-plan) | Ограниченный free-план без commercial license; не обещай бесплатный коммерческий финал. |
| Replicate / fal | Trials не равны recurring-free. Не включай их в список постоянных бесплатных маршрутов без новой проверки конкретного предложения. |

## Необязательный локальный маршрут

[ComfyUI MCP](https://docs.comfy.org/agent-tools/mcp), небольшой SD1.5/IPAdapter и [rembg](https://github.com/danielgatis/rembg) — отдельный вариант при подходящем уже доступном окружении или явном разрешении настройки. Не устанавливай автоматически. Не обещай мощные image-edit модели на RTX 3050 6 GB: для штатного Klein 4B в переданном исследовании указан benchmark 8.4 GB VRAM, что выше этой видеопамяти.

Для каждой новой позы используй одни и те же канонические references, а не цепочку постепенно дрейфующих перегенераций. Для плавного движения часто лучше анимировать согласованный cutout/риг, чем независимо генерировать каждый кадр. Проверяй реальную alpha и край на светлом/тёмном: PNG сам по себе не означает прозрачность. Полный процесс — [согласованность изображений](image-continuity.md).

В результате кратко укажи реально использованные provider/модель, доступный маршрут, дату проверки ограничений и источник/условия. VidIQ может быть опциональным источником звука в разрешённом будущем задании; он не универсальная зависимость, не заявляется безусловно бесплатным, голос за пользователя здесь не выбран. Никакая генерация в рамках подготовки этой редакции не выполняется.
