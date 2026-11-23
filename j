[models]
default = "vercel-ai-gateway:anthropic/claude-fable-5"

[models.providers.vercel-ai-gateway]
display_name = "Vercel AI Gateway"
api_key_env = "AI_GATEWAY_API_KEY"
base_url = "https://ai-gateway.vercel.sh/coding-agent/v1"
class_path = "langchain_openai:ChatOpenAI"
models = [ "anthropic/claude-fable-5", "alibaba/qwen-3-14b", "alibaba/qwen-3-235b", "alibaba/qwen-3-30b", "alibaba/qwen-3-32b", "alibaba/qwen3-coder", "alibaba/qwen3-coder-30b-a3b", "alibaba/qwen3-coder-next", "alibaba/qwen3-max-thinking", "alibaba/qwen3-next-80b-a3b-instruct" ]

[models.providers.vercel-ai-gateway.profile."anthropic/claude-fable-5"]
name = "Claude Fable 5"
max_input_tokens = 1000000
max_output_tokens = 128000

[models.providers.vercel-ai-gateway.profile."alibaba/qwen-3-14b"]
name = "Qwen3-14B"
max_input_tokens = 40960
max_output_tokens = 16384

[models.providers.vercel-ai-gateway.profile."alibaba/qwen-3-235b"]
name = "Qwen3 235B A22B"
max_input_tokens = 262144
max_output_tokens = 16384

[models.providers.vercel-ai-gateway.profile."alibaba/qwen-3-30b"]
name = "Qwen3-30B-A3B"
max_input_tokens = 40960
max_output_tokens = 16384

[models.providers.vercel-ai-gateway.profile."alibaba/qwen-3-32b"]
name = "Qwen 3 32B"
max_input_tokens = 128000
max_output_tokens = 8192

[models.providers.vercel-ai-gateway.profile."alibaba/qwen3-coder"]
name = "Qwen3 Coder 480B A35B Instruct"
max_input_tokens = 262144
max_output_tokens = 32768

[models.providers.vercel-ai-gateway.profile."alibaba/qwen3-coder-30b-a3b"]
name = "Qwen 3 Coder 30B A3B Instruct"
max_input_tokens = 262144
max_output_tokens = 8192

[models.providers.vercel-ai-gateway.profile."alibaba/qwen3-coder-next"]
name = "Qwen3 Coder Next"
max_input_tokens = 256000
max_output_tokens = 256000

[models.providers.vercel-ai-gateway.profile."alibaba/qwen3-max-thinking"]
name = "Qwen 3 Max Thinking"
max_input_tokens = 256000
max_output_tokens = 65536

[models.providers.vercel-ai-gateway.profile."alibaba/qwen3-next-80b-a3b-instruct"]
name = "Qwen3 Next 80B A3B Instruct"
max_input_tokens = 262114
max_output_tokens = 262114

[models.providers.vercel-ai-gateway.params]
use_responses_api = false

