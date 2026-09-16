from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


# PostgreSQL engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
)


# Database session factory
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


# Base class for all database models
class Base(DeclarativeBase):
    pass


# FastAPI dependency
def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()