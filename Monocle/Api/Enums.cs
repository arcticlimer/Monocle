﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Monocle.Api
{
    internal enum ErrorType
    {
        InvalidRequestType,
        UserNotFound,
        InvalidRequestData,
    }

    internal enum MessageKind
    {
        Response,
        Event,
        Error
    }

    internal enum RequestType
    {
        Authenticate,
        Players,
        PlayerDetails,
        Structures,
        Barricades,
        Vehicles,
        ServerInfo,
    }

    internal enum ResponseType
    {
        Players,
        CurrentBuildings,
        SuccessfulLogin,
        Vehicles,
        Barricades,
        Structures,
        ServerInfo,
    }

    internal enum EventType
    {
        PlayerDeath,
        PlayerMessage,
        PlayerJoined,
        PlayerLeft,
    }

    public enum AuthorizedUserType
    {
        Observer,
        Administrator
    }

    enum ChatMode
    {
        Global,
        Local,
        Group,
        Say,
        Welcome,
    }
}
