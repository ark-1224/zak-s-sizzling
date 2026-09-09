import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import type { UserAccountDTO } from "@zaks/shared-types";

type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;

function toUserDTO(user: UserWithRole): UserAccountDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.name as "admin" | "staff",
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

// Only admin/staff accounts show up here — customers never have a User row.
export async function listStaffUsers(): Promise<UserAccountDTO[]> {
  const users = await prisma.user.findMany({
    where: { role: { name: { in: ["admin", "staff"] } } },
    include: { role: true },
    orderBy: { createdAt: "asc" },
  });
  return users.map(toUserDTO);
}

export async function createStaffUser(input: {
  name: string;
  email: string;
  password: string;
  role: "admin" | "staff";
}): Promise<UserAccountDTO> {
  const role = await prisma.role.findUnique({ where: { name: input.role } });
  if (!role) throw new HttpError(500, `Role "${input.role}" is not seeded`);

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 10),
        roleId: role.id,
      },
      include: { role: true },
    });
    return toUserDTO(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "A user with that email already exists");
    }
    throw err;
  }
}

export async function updateStaffUser(
  id: string,
  input: { name?: string; role?: "admin" | "staff"; isActive?: boolean; password?: string },
  actingUserId: string
): Promise<UserAccountDTO> {
  if (id === actingUserId && (input.isActive === false || input.role === "staff")) {
    throw new HttpError(400, "You can't deactivate or demote your own account");
  }

  const data: Prisma.UserUpdateInput = { name: input.name, isActive: input.isActive };
  if (input.role) {
    const role = await prisma.role.findUnique({ where: { name: input.role } });
    if (!role) throw new HttpError(500, `Role "${input.role}" is not seeded`);
    data.role = { connect: { id: role.id } };
  }
  if (input.password) data.passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.update({ where: { id }, data, include: { role: true } });
  return toUserDTO(user);
}
