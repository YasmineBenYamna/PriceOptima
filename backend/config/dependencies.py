"""
Câblage manuel des dépendances.
Chaîne : DatabaseManager → Repositories → Services → API
"""

from config.database import DatabaseManager
from config.settings import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD

from repositories.user_repository     import UserRepository
from repositories.rule_repository     import RuleRepository
from repositories.strategy_repository import StrategyRepository
from repositories.job_repository      import JobRepository

from services.auth_service     import AuthService
from services.product_service  import ProductService
from services.rule_service     import RuleService
from services.strategy_service import StrategyService
from services.pricing_service  import PricingService
from services.job_service      import JobService

from services.llm_service import LLMService
from config.settings import GROQ_API_KEY  

# 1. DatabaseManager
db_manager = DatabaseManager(
    host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD
)

# 2. Repositories
user_repo     = UserRepository(db_manager)
rule_repo     = RuleRepository(db_manager)
strategy_repo = StrategyRepository(db_manager)
job_repo      = JobRepository(db_manager)

# 3. Services
auth_service     = AuthService(user_repo)
product_service  = ProductService(db_manager)
rule_service     = RuleService(rule_repo)
strategy_service = StrategyService(strategy_repo, rule_repo)
pricing_service  = PricingService(db_manager)
llm_service = LLMService(db_manager, GROQ_API_KEY)
job_service      = JobService(job_repo, strategy_service, pricing_service)