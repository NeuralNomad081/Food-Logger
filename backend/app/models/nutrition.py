from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    food_logs: List["FoodLog"] = Relationship(back_populates="user")

class Food(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    food_name: str
    brand: Optional[str] = None
    serving_size: float
    serving_unit: str = "g"
    calories: float
    protein: float
    carbs: float
    fat: float
    food_logs: List["FoodLog"] = Relationship(back_populates="food")

class FoodLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    food_id: int = Field(foreign_key="food.id")
    serving_consumed: float
    calories_logged: float
    protein_logged: float
    carbs_logged: float
    fat_logged: float
    date: datetime = Field(default_factory=datetime.utcnow)
    user: User = Relationship(back_populates="food_logs")
    food: Food = Relationship(back_populates="food_logs")
