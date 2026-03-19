Restructure 
travel_agent.py
 into ai-service Module
Tách file 
travel_agent.py
 monolithic (1691 dòng, 10 phases) thành cấu trúc thư mục modular trong Tripcompass/ai-service/.

Proposed Directory Structure
Tripcompass/ai-service/
├── main.py                          # Entry point (Phase 10)
├── requirements.txt                 # Dependencies
├── Dockerfile                       # Container build
├── .env.example                     # Environment template
├── app/
│   ├── __init__.py
│   ├── config/
│   │   ├── __init__.py
│   │   ├── settings.py              # Env loading, LLM init, API keys
│   │   └── constants.py             # REQUIRED_TRIP_FIELDS, budget limits, IATA_MAP
│   ├── models/
│   │   ├── __init__.py
│   │   ├── state.py                 # TravelPipelineState, TripRequirements, ResearchResults, BudgetBreakdown
│   │   ├── serpapi_models.py        # SerpAPIHotelResult, SerpAPIFlightResult
│   │   └── extraction_models.py    # HotelExtract, AttractionExtract, FoodExtract, ClarificationResult, JudgeOutput
│   ├── services/
│   │   ├── __init__.py
│   │   ├── serpapi_hotels.py        # search_hotels_serpapi, _format_serpapi_hotels
│   │   ├── serpapi_flights.py       # search_flights_serpapi, _format_serpapi_flights
│   │   └── search_tools.py         # Tavily wrapper, _run_safe_tool_calls, _normalize_tavily_args
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── date_utils.py           # _parse_and_validate_dates, _to_iso_date, DateSpanError
│   │   ├── price_utils.py          # _usd_to_vnd, _parse_price, _extract_vnd_amounts, regex extractors
│   │   └── text_utils.py           # _sanitize_url, _sanitize_display, _extract_source_urls
│   ├── prompts/
│   │   ├── __init__.py
│   │   ├── clarification.py        # CLARIFICATION_SYSTEM
│   │   ├── analyst.py              # ANALYST_SYSTEM
│   │   ├── research.py             # ATTRACTIONS_PROMPT, FOOD_PROMPT, HOTELS_PROMPT, etc.
│   │   └── planner.py              # PLANNER_SYSTEM
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── clarification.py         # clarification_agent, should_clarify_or_proceed, abort_node
│   │   ├── destination_analyst.py    # destination_analyst
│   │   ├── research/
│   │   │   ├── __init__.py
│   │   │   ├── base.py              # _make_research_node, _run_with_citations, ResearchAgentState
│   │   │   ├── attractions.py        # run_attractions_agent
│   │   │   ├── food.py               # run_food_agent
│   │   │   ├── hotels.py             # run_hotels_agent (+ SerpAPI integration)
│   │   │   ├── combos.py             # run_combos_agent
│   │   │   └── transport.py          # run_transport_agent (+ SerpAPI flights)
│   │   ├── budget_validator.py       # budget_validator
│   │   ├── planner.py                # planner_agent
│   │   └── judge.py                  # judge_agent
│   └── pipeline/
│       ├── __init__.py
│       ├── graph.py                  # StateGraph assembly, compile
│       └── runner.py                 # dispatch_research, collect_research, dispatch_research_node
Proposed Changes
Config Module
[NEW] 
settings.py
Load .env, initialize ChatNebius LLM instances, TavilySearch, SERPAPI_KEY, TODAY
Lines 24–70 of travel_agent.py
[NEW] 
constants.py
REQUIRED_TRIP_FIELDS, budget limits, IATA_MAP, _to_iata()
Lines 76–108
Models Module
[NEW] 
state.py
TripRequirements, ResearchResults, BudgetBreakdown, TravelPipelineState, merge_dict
Lines 113–181
[NEW] 
serpapi_models.py
SerpAPIHotelResult, SerpAPIFlightResult, VND_PER_USD
Lines 187–208
[NEW] 
extraction_models.py
HotelExtract, AttractionExtract, FoodExtract, ClarificationResult, JudgeOutput
Lines 474–479 + 1133–1160 + 1495–1498
Services Module
[NEW] 
serpapi_hotels.py
search_hotels_serpapi(), _format_serpapi_hotels()
Lines 228–391
[NEW] 
serpapi_flights.py
search_flights_serpapi(), _format_serpapi_flights()
Lines 301–437
[NEW] 
search_tools.py
_normalize_tavily_args(), _run_safe_tool_calls(), _is_malformed_tool_call()
Lines 696–771
Utils Module
[NEW] 
date_utils.py
DateSpanError, _parse_and_validate_dates(), _to_iso_date(), _recover_dates_from_messages()
Lines 443–524
[NEW] 
price_utils.py
_usd_to_vnd(), _parse_price(), _extract_vnd_amounts(), _extract_combo_totals(), _regex_hotel_price(), _regex_attraction_prices(), _regex_food_per_day()
Lines 211–1131
[NEW] 
text_utils.py
_sanitize_url(), _sanitize_display(), _extract_source_urls()
Lines 774–802
Prompts Module
[NEW] 
clarification.py
CLARIFICATION_SYSTEM template — Lines 481–500
[NEW] 
analyst.py
ANALYST_SYSTEM template — Lines 619–627
[NEW] 
research.py
ATTRACTIONS_PROMPT, FOOD_PROMPT, HOTELS_PROMPT, COMBOS_PROMPT, TRANSPORT_PROMPT
Lines 859–943
[NEW] 
planner.py
PLANNER_SYSTEM template — Lines 1369–1432
Agents Module
[NEW] 
clarification.py
clarification_agent(), should_clarify_or_proceed(), abort_node()
Lines 527–614
[NEW] 
destination_analyst.py
destination_analyst()
Lines 630–655
[NEW] Research sub-agents (base, attractions, food, hotels, combos, transport)
_make_research_node(), _run_with_citations() in base
Individual agent runners
Lines 805–1036
[NEW] 
budget_validator.py
budget_validator() — Lines 1162–1363
[NEW] 
planner.py
planner_agent() — Lines 1435–1489
[NEW] 
judge.py
judge_agent() — Lines 1504–1589
Pipeline Module
[NEW] 
graph.py
StateGraph assembly, node registration, edge definitions, compile()
Lines 1606–1641
[NEW] 
runner.py
dispatch_research_node(), dispatch_research(), collect_research()
Lines 661–1603
Entry Point
[NEW] 
main.py
CLI runner — Lines 1647–1691
[NEW] 
requirements.txt
All dependencies: langchain-nebius, langchain, langgraph, rich, python-dotenv, langchain-tavily, google-search-results, pydantic
[NEW] 
.env.example
Template with NEBIUS_API_KEY, TAVILY_API_KEY, SERPAPI_API_KEY, LANGCHAIN_API_KEY
Verification Plan
Manual Verification
Kiểm tra tất cả file đã tạo đúng cấu trúc bằng tree hoặc ls -R
Chạy python -c "from app.pipeline.graph import travel_app" để verify imports
Chạy python main.py để verify pipeline hoạt động end-to-end (cần .env với API keys thật)
NOTE

File gốc travel_agent.py sẽ không bị xóa. Cấu trúc mới sẽ được tạo hoàn toàn trong Tripcompass/ai-service/.