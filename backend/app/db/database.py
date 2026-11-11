from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


# Normalize database URL (handles Render postgres:// and standard postgresql://)
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

connect_args = {}
engine_options = {}
if "sqlite" in db_url:
    connect_args["check_same_thread"] = False
else:
    # Hosted Postgres (Neon, Render): Neon's pooled endpoint runs PgBouncer in transaction mode, which can't
    # keep server-side prepared statements between queries, so psycopg must not create them. Neon also closes
    # idle connections when the compute sleeps; recycle them before that and re-check on checkout.
    connect_args["prepare_threshold"] = None
    engine_options.update(pool_recycle=300, pool_size=5, max_overflow=5)

# Database engine
engine = create_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    **engine_options,
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


def init_db():
    Base.metadata.create_all(bind=engine)


# FastAPI dependency
def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()