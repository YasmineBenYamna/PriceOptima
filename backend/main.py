from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import logging
import time

from config.settings import APP_TITLE, APP_VERSION
from config.dependencies import db_manager
from api import auth, products, rules, strategies, pricing, jobs, superset, llm

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def wait_for_db(retries=15, delay=3):
    for attempt in range(retries):
        try:
            db_manager.create_tables()
            logger.info("✅ DB connectée et tables créées")
            return
        except Exception as e:
            logger.warning(f"⏳ DB pas prête ({attempt+1}/{retries}): {e}")
            time.sleep(delay)
    raise RuntimeError("❌ DB inaccessible après plusieurs tentatives")


@asynccontextmanager
async def lifespan(app: FastAPI):
    wait_for_db()   # ← appelé ici, plus au niveau module
    yield


#  Passe lifespan à FastAPI
app = FastAPI(title=APP_TITLE, version=APP_VERSION, lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc):
    return JSONResponse(status_code=422, content={"error": "VALIDATION_ERROR", "detail": str(exc)})


app.include_router(auth.router)
app.include_router(products.router)
app.include_router(rules.router)
app.include_router(strategies.router)
app.include_router(pricing.router)
app.include_router(jobs.router)
app.include_router(superset.router)
app.include_router(llm.router)


@app.get("/")
def root():
    return {"message": f"{APP_TITLE} v{APP_VERSION}", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}