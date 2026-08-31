from app import models  # noqa: F401
from app.database import Base, engine


def init_database() -> None:
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_database()
