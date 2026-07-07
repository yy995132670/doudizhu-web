import logging
from typing import Dict, Optional

from .player import Player
from .room import Room


class GlobalVar(object):
    total_room_count = 0
    __players__: Dict[int, Player] = {}
    __waiting_rooms__: Dict[int, Room] = {}
    __playing_rooms__: Dict[int, Room] = {}

    @classmethod
    def room_list(cls):
        rooms = {1: {'level': 1, 'number': 0, 'rooms': []},
                 2: {'level': 2, 'number': 0, 'rooms': []},
                 3: {'level': 3, 'number': 0, 'rooms': []}}
        all_rooms = list(cls.__waiting_rooms__.values()) + list(cls.__playing_rooms__.values())
        for room in all_rooms:
            if room.level not in rooms:
                rooms[room.level] = {'level': room.level, 'number': 0, 'rooms': []}
            size = room.size()
            rooms[room.level]['number'] += size
            rooms[room.level]['rooms'].append({
                'id': room.room_id,
                'level': room.level,
                'players': size,
                'state': int(room.room_state),
                'playing': room.room_id in cls.__playing_rooms__,
            })
        return list(rooms.values())

    @classmethod
    def find_player(cls, uid: int, *args, **kwargs) -> Player:
        if uid not in cls.__players__:
            cls.__players__[uid] = Player(uid, *args, **kwargs)
        return cls.__players__[uid]

    @classmethod
    def find_player_room_id(cls, uid: int) -> int:
        player = cls.__players__.get(uid)
        if player and player.room:
            return player.room.room_id
        return -1

    @classmethod
    def remove_player(cls, uid: int):
        cls.__players__.pop(uid, None)

    @classmethod
    def new_room(cls, level: int, allow_robot: bool) -> Room:
        room = Room(cls.gen_room_id(), level, allow_robot)
        cls.__waiting_rooms__[room.room_id] = room
        logging.info('ROOM[%s] CREATED', room)
        return room

    @classmethod
    def find_room(cls, room_id: int, level: int, allow_robot: bool) -> Optional[Room]:
        if room_id == 0:
            return cls.new_room(level, allow_robot)

        if room_id in cls.__waiting_rooms__:
            return cls.__waiting_rooms__[room_id]

        if room_id in cls.__playing_rooms__:
            return cls.__playing_rooms__[room_id]

        if room_id > 0:
            return None

        for _, room in cls.__waiting_rooms__.items():
            if room.level != level or room.has_robot() or room.is_full():
                continue
            return room
        return cls.new_room(level, allow_robot)

    @classmethod
    def on_room_changed(cls, room: Room):
        if room.is_full():
            cls.__waiting_rooms__.pop(room.room_id, None)
            cls.__playing_rooms__[room.room_id] = room
            logging.info('Room[%s] FULL', room)
            return
        if room.is_empty():
            cls.__waiting_rooms__.pop(room.room_id, None)
            cls.__playing_rooms__.pop(room.room_id, None)
            logging.info('Room[%s] CLOSED', room)
            return

        cls.__playing_rooms__.pop(room.room_id, None)
        cls.__waiting_rooms__[room.room_id] = room

    @classmethod
    def gen_room_id(cls) -> int:
        cls.total_room_count += 1
        if cls.total_room_count > 999999:
            cls.total_room_count = 1
        return cls.total_room_count
