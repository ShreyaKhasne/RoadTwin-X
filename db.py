from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import DateTime, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class StoredDocument(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(24), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    payload: Mapped[str] = mapped_column(Text)


def _database_url() -> str:
    configured = os.getenv("ROADTWIN_DATABASE_URL")
    if configured:
        return configured
    location = Path(__file__).resolve().parents[1] / "roadtwin.db"
    return f"sqlite:///{location.as_posix()}"


engine = create_engine(
    _database_url(),
    connect_args={"check_same_thread": False} if _database_url().startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)


def list_documents(session: Session, kind: str) -> list[StoredDocument]:
    return list(
        session.scalars(
            select(StoredDocument)
            .where(StoredDocument.kind == kind)
            .order_by(StoredDocument.created_at.desc())
        )
    )
